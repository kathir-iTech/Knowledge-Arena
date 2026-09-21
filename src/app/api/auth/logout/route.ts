import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { SESSION_COOKIE_NAME } from '@/lib/session-cookie';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (idToken) {
      try {
        const decoded = await getAdminAuth().verifyIdToken(idToken);
        await getAdminAuth().revokeRefreshTokens(decoded.uid);
      } catch {
        // Token invalid — still clear the cookie; revocation happens on next login
      }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      ...cookieOptions(),
      maxAge: 0,
    });
    return response;
  } catch (err) {
    const e = err as { message?: string; name?: string };
    console.error('[Logout] Error:', e?.name, e?.message);
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      ...cookieOptions(),
      maxAge: 0,
    });
    return response;
  }
}

function cookieOptions(): Record<string, string | number | boolean> {
  return { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' };
}