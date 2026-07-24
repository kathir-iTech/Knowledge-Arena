import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/', '/kicked', '/cheating-detected', '/force-password-change'];
const BATTLE_ROUTE_PREFIX = '/battle/';
const API_ROUTE_PREFIX = '/api/';

const PORTAL_ROUTES: Record<string, string> = {
  '/executive': 'executive',
  '/commander': 'commander',
  '/create-quiz': 'commander',
  '/gladiator': 'gladiator',
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes, battle routes, API routes, and Firebase Auth handler paths
  if (
    PUBLIC_ROUTES.includes(pathname) ||
    pathname.startsWith('/__/') ||
    pathname.startsWith(BATTLE_ROUTE_PREFIX) ||
    pathname.startsWith(API_ROUTE_PREFIX) ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Determine which portal this route belongs to
  let requiredRole: string | null = null;
  for (const [prefix, role] of Object.entries(PORTAL_ROUTES)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      requiredRole = role;
      break;
    }
  }

  if (!requiredRole) {
    // Unknown route — redirect to home
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Check for session cookie or token
  // For now, pass through — client-side AuthContext handles enforcement
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
