import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { SESSION_COOKIE_NAME } from '@/lib/session-cookie';
import { ROLE_HOME } from '@/lib/auth-redirect';
import { readRoleClaim } from '@/lib/session-role';

export const runtime = 'nodejs';

// SIH-26242 (branch sih-26242-rpl): RPL-COMPASS ONLY.
// The only surfaces served by this branch are the public landing/login and the
// /rpl/* app. Every legacy Quorena page/portal is "quarantined": an
// authenticated visitor is sent into the RPL app, a guest to /login. This is
// what stops an existing Quorena Google account from landing on the old
// battle/dashboard shell (A1).
const PUBLIC_ROUTES = ['/', '/login'];
const API_ROUTE_PREFIX = '/api/';

const QUARANTINE_ROUTES = [
  '/gladiator',
  '/commander',
  '/executive',
  '/create-quiz',
  '/battle',
  '/kicked',
  '/cheating-detected',
  '/force-password-change',
];

function isQuarantined(pathname: string): boolean {
  return QUARANTINE_ROUTES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

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
  // Local emulators (Auth :9099 / Firestore :8080 / RTDB :9000) are reachable
  // from the browser only when this build is EXPLICITLY pointed at them:
  // either `next dev`, or a production build with
  // NEXT_PUBLIC_FIREBASE_EMULATOR=true (set by `npm run demo` and the local
  // verification scripts, never by Vercel). Deployed responses therefore keep
  // the locked connect-src, and script-src (nonce + 'strict-dynamic') is NOT
  // relaxed for emulator builds — only connect-src gains localhost.
  const allowLocalEmulator = isDev || process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true';
  if (allowLocalEmulator) {
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
    `frame-src 'self' https://studio-4092189688-c74a7.firebaseapp.com https://vercel.live`,
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
    pathname.startsWith(API_ROUTE_PREFIX) ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.webmanifest'
  ) {
    if (isApiOrAsset) return NextResponse.next();
    return withCspResponse(request);
  }

  // A1: every legacy Quorena surface is off-limits on this branch. Send
  // authenticated users into the RPL app; guests go to /login where they can
  // sign in (Google or email/password) and are then routed to /rpl by
  // ClientLayout/ROLE_HOME. This is a redirect, never a Quorena page render.
  if (isQuarantined(pathname)) {
    const quarantineCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (quarantineCookie) {
      try {
        await getAdminAuth().verifySessionCookie(quarantineCookie, true);
        return NextResponse.redirect(new URL('/rpl', request.url));
      } catch {
        // Fall through to /login below.
      }
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // SIH-26242 RPL track — additive branch (approved exception to the
  // never-touch-existing-files rule: without this, middleware 307s every
  // /rpl/* path to / and the RPL UI is unreachable in any browser).
  // Requires any valid session cookie; fine-grained role gating lives in
  // src/app/(rpl)/rpl/layout.tsx + page-level guards (which read Firestore
  // roles and work with emulator demo accounts). No existing route changes.
  if (pathname === '/rpl' || pathname.startsWith('/rpl/')) {
    // Phase A5: remember where the user was going so login returns them there
    // instead of dropping them on the RPL Compass dashboard.
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
    const rplCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!rplCookie) {
      return NextResponse.redirect(loginUrl);
    }
    try {
      await getAdminAuth().verifySessionCookie(rplCookie, true);
    } catch {
      return NextResponse.redirect(loginUrl);
    }
    return withCspResponse(request);
  }

  // Any other route is not part of this branch: send authenticated users to
  // their RPL home and guests to the landing page (never render a stray
  // Quorena surface).
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookie) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
      const userRole = readRoleClaim(decoded) as string | undefined;
      return NextResponse.redirect(
        new URL((userRole && ROLE_HOME[userRole]) || '/rpl', request.url),
      );
    } catch {
      // Expired/invalid cookie — treat as a guest.
    }
  }
  return NextResponse.redirect(new URL('/', request.url));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|txt|css|js|mjs|woff|woff2|ttf|eot|pdf|xml)$).*)',
  ],
};