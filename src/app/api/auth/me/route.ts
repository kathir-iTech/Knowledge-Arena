import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '@/lib/session-cookie';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get('__session')?.value;
    if (!cookie) {
      return NextResponse.json({ error: 'Unauthorized', authenticated: false }, { status: 401 });
    }

    const decoded = await verifySessionCookie(cookie, true);
    return NextResponse.json({
      authenticated: true,
      uid: decoded.uid,
      email: decoded.email ?? null,
      role: decoded.customClaims?.role ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized', authenticated: false }, { status: 401 });
  }
}