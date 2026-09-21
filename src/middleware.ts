import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { SESSION_COOKIE_NAME } from '@/lib/session-cookie';
import { ROLE_HOME } from '@/lib/auth-redirect';

export const runtime = 'nodejs';

const PUBLIC_ROUTES = ['/', '/login', '/kicked', '/cheating-detected', '/force-password-change'];
const BATTLE_ROUTE_PREFIX = '/battle/';
const API_ROUTE_PREFIX = '/api/';

const PORTAL_ROUTES: Record<string, string> = {
  '/executive': 'executive',
  '/commander': 'commander',
  '/create-quiz': 'commander',
  '/gladiator': 'gladiator',
};

// Strict, nonce-based CSP (audit Phase 1 — serverless execution sandbox).
// The nonce is generated per-request so only the exact scripts/Next hydration
// payloads rendered for this response may execute; anything injected by an XSS
// or prototype-pollution payload gets blocked. connect-src is locked to the
// Firebase/Supabase surface so a rogue script cannot exfiltrate to a random
// origin. In dev, the Firebase emulator origins + React devtools eval are
// permitted; in production they are dropped. This is intentionally computed for
// every HTML response (the middleware record in the Next docs pattern) and must
// be matched by per-request dynamic rendering (see app/layout.tsx).
function buildCspHeader(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';

  const connectSources = [
    "'self'",
    'https://*.googleapis.com',
    'https://*.firebaseio.com',
    'https://*.firebaseapp.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'wss://*.firebaseio.com',
  ];
  if (isDev) {
    connectSources.push(
      'http://localhost:*',
      'http://127.0.0.1:*',
      'ws://localhost:*',
      'ws://127.0.0.1:*'
    );
  }

  const imgSources = [
    "'self'",
    'data:',
    'blob:',
    'https://*.googleusercontent.com',
    'https://lh3.googleusercontent.com',
  ];

  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${imgSources.join(' ')}`,
    `connect-src ${connectSources.join(' ')}`,
    `font-src 'self' data:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
  ];
  if (!isDev) directives.push('upgrade-insecure-requests');

  return directives.join('; ');
}

function withCspResponse(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID();
  const csp = buildCspHeader(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isApiOrAsset =
    pathname.startsWith(API_ROUTE_PREFIX) ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.webmanifest';

  if (
    PUBLIC_ROUTES.includes(pathname) ||
    pathname.startsWith('/__/') ||
    pathname.startsWith(BATTLE_ROUTE_PREFIX) ||
    pathname.startsWith(API_ROUTE_PREFIX) ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.webmanifest'
  ) {
    if (isApiOrAsset) return NextResponse.next();
    return withCspResponse(request);
  }

  let requiredRole: string | null = null;
  for (const [prefix, role] of Object.entries(PORTAL_ROUTES)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      requiredRole = role;
      break;
    }
  }

  if (!requiredRole) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Verify session cookie via Admin SDK (Node.js runtime)
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const decoded = await getAdminAuth().verifySessionCookie(cookie, true);

    // Wrong-role users go to their OWN dashboard (roleless users to /login).
    // Redirecting to the requested portal would loop back onto itself, and
    // the bare /<role> prefix has no page — ROLE_HOME is the real landing.
    const userRole = decoded.customClaims?.role;
    if (requiredRole && userRole !== requiredRole) {
      return NextResponse.redirect(new URL((userRole && ROLE_HOME[userRole]) || '/login', request.url));
    }
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return withCspResponse(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|txt|css|js|mjs|woff|woff2|ttf|eot|pdf|xml)$).*)',
  ],
};