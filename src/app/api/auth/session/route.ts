import { NextRequest, NextResponse } from 'next/server';
import { createSessionCookie, SESSION_COOKIE_NAME, cookieOptions } from '@/lib/session-cookie';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveSessionRole } from '@/lib/session-role';
import { firebaseConfig } from '@/firebase/config';

export const runtime = 'nodejs';

// Phase A3: never return a bare "Failed to create session" — name the actual
// misconfiguration (ids only, never key material) so the operator can fix it.
function projectMismatchResponse(message: string): NextResponse {
  console.error(
    `[Session] SERVICE_ACCOUNT_PROJECT_MISMATCH client=${firebaseConfig.projectId} detail=${message}`,
  );
  return NextResponse.json(
    {
      error:
        `Server session could not be created: the service account key does not belong to ` +
        `Firebase project "${firebaseConfig.projectId}". Set FIREBASE_SERVICE_ACCOUNT_KEY ` +
        `(Service accounts > Generate new private key) for THIS project in Vercel.`,
      code: 'SERVICE_ACCOUNT_PROJECT_MISMATCH',
    },
    { status: 500 },
  );
}

function credentialsErrorResponse(message: string): NextResponse {
  console.error(`[Session] ADMIN_CREDENTIALS_UNAVAILABLE: ${message}`);
  return NextResponse.json(
    {
      error:
        'Server session could not be created: the Firebase Admin credentials are missing or malformed. ' +
        `Target project "${firebaseConfig.projectId}".`,
      code: 'ADMIN_CREDENTIALS_UNAVAILABLE',
    },
    { status: 500 },
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body', code: 'BAD_REQUEST' }, { status: 400 });
    }

    const idToken = typeof body.idToken === 'string' ? body.idToken : null;
    if (!idToken) {
      return NextResponse.json({ error: 'idToken is required', code: 'BAD_REQUEST' }, { status: 400 });
    }

    // Phase A2: the cookie must carry the role claim — the edge middleware can
    // only read the token, it has no Firestore access.
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const claimRole = (decoded.customClaims as { role?: unknown } | undefined)?.role;

    let docRole: unknown = null;
    let lookupFailed = false;
    if (typeof claimRole !== 'string') {
      try {
        const snap = await getAdminDb().collection('users').doc(decoded.uid).get();
        docRole = snap.exists ? snap.data()?.role : null;
      } catch (err) {
        lookupFailed = true;
        console.error(
          `[Session] role lookup failed uid=${decoded.uid} project=${firebaseConfig.projectId}`,
          (err as Error)?.message,
        );
      }
    }

    const decision = resolveSessionRole({ claimRole, docRole, lookupFailed });

    if (decision.action === 'role-missing') {
      console.error(
        `[Session] ROLE_MISSING uid=${decoded.uid} email=${decoded.email ?? 'n/a'} ` +
          `project=${firebaseConfig.projectId} hasClaim=${claimRole !== undefined} hasUserDoc=false`,
      );
      return NextResponse.json(
        {
          error:
            'This account has no role yet, so it cannot be given a session. ' +
            'Ask your Executive to assign you a role, or use a different account.',
          code: 'ROLE_MISSING',
        },
        { status: 409 },
      );
    }

    if (decision.action === 'lookup-failed') {
      return NextResponse.json(
        {
          error:
            'Could not read your profile to confirm your role (Firestore unavailable). Please try again in a moment.',
          code: 'ROLE_LOOKUP_FAILED',
        },
        { status: 503 },
      );
    }

    if (decision.action === 'refresh-claims') {
      const previousClaims = (decoded.customClaims ?? {}) as Record<string, unknown>;
      try {
        await getAdminAuth().setCustomUserClaims(decoded.uid, { ...previousClaims, role: decision.role });
      } catch (err) {
        console.error(`[Session] CLAIM_SYNC_FAILED uid=${decoded.uid}`, (err as Error)?.message);
        return NextResponse.json(
          {
            error: `Your role could not be saved to your account (${(err as Error)?.message ?? 'unknown error'}). Please try again.`,
            code: 'CLAIM_SYNC_FAILED',
          },
          { status: 500 },
        );
      }
      console.warn(
        `[Session] role claim synced uid=${decoded.uid} role=${decision.role} ` +
          `project=${firebaseConfig.projectId} (client must refresh the token and re-mint)`,
      );
      return NextResponse.json({ success: true, claimsRefresh: true, role: decision.role });
    }

    const sessionCookie = await createSessionCookie(idToken);

    const response = NextResponse.json({ success: true, role: decision.role });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, cookieOptions());
    return response;
  } catch (err) {
    const e = err as { message?: string; name?: string };
    console.error('[Session] Error:', e?.name, e?.message);
    const message = String(e?.message ?? '');
    if (message.includes('does not match client project')) return projectMismatchResponse(message);
    if (message.includes('id-token-expired') || message.includes('session-cookie-expired')) {
      return NextResponse.json(
        { error: 'Your sign-in token expired. Please sign in again.', code: 'TOKEN_EXPIRED' },
        { status: 401 },
      );
    }
    if (
      message.includes('FIREBASE_SERVICE_ACCOUNT_KEY') ||
      message.includes('invalid JSON') ||
      message.includes('missing required fields') ||
      message.includes('Application Default Credentials') ||
      message.includes('default credentials')
    ) {
      return credentialsErrorResponse(message);
    }
    return NextResponse.json({ error: 'Failed to create session', code: 'SESSION_FAILED' }, { status: 500 });
  }
}
