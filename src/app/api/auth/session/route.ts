import { NextRequest, NextResponse } from 'next/server';
import { createSessionCookie, SESSION_COOKIE_NAME, cookieOptions } from '@/lib/session-cookie';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const idToken = typeof body.idToken === 'string' ? body.idToken : null;
    if (!idToken) {
      return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
    }

    const sessionCookie = await createSessionCookie(idToken);

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, cookieOptions());
    return response;
  } catch (err) {
    const e = err as { message?: string; name?: string };
    console.error('[Session] Error:', e?.name, e?.message);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}