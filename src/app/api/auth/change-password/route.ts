import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { validatePasswordStrength } from '@/lib/password-policy';
import { logAuthFailure } from '@/lib/security-log';
import { auditService } from '@/services/audit.service';

export const runtime = 'nodejs';

// Fresh-token window: the client must re-authenticate with the current
// password immediately before changing it, so the ID token's auth_time is
// recent. This proves current-password knowledge without trusting the client.
const MAX_AUTH_AGE_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      logAuthFailure('auth:change-password', 'missing_bearer_header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));
    } catch {
      logAuthFailure('auth:change-password', 'invalid_token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimitResponse = enforceRateLimit(`auth:change:${decoded.uid}`, Limits.WRITE_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const userDoc = await getAdminDb().collection('users').doc(decoded.uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userData = userDoc.data()!;
    const mustChange = userData.mustChangePassword === true;

    // The token must have been minted by a fresh sign-in / re-authentication.
    // auth_time is the time of the last successful credential verification.
    const authTimeMs = (decoded.auth_time ?? 0) * 1000;
    if (!authTimeMs || Date.now() - authTimeMs > MAX_AUTH_AGE_MS) {
      logAuthFailure(`auth:${decoded.uid}`, 'stale_auth_time_for_password_change');
      return NextResponse.json({
        error: mustChange
          ? 'Your session is too old. Re-authenticate with your current password and try again.'
          : 'Your session is too old. Sign in again before changing your password.',
      }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.errors.join(' ') }, { status: 400 });
    }

    await getAdminAuth().updateUser(decoded.uid, { password: newPassword });

    const update: Record<string, unknown> = { mustChangePassword: false };
    await getAdminDb().collection('users').doc(decoded.uid).update(update);

    await auditService.record({
      timestamp: Date.now(),
      actor: decoded.uid,
      actorRole: userData.role || 'unknown',
      action: 'password_changed',
      target: decoded.uid,
      metadata: { forced: mustChange },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[ChangePassword] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
