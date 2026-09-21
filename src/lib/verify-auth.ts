import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { logAuthFailure } from '@/lib/security-log';
import { hasPermission as hasCapPermission, type CapabilityName } from '@/lib/permissions';

// R2-33 additive capability gate (second gate after role checks; never replaces them).
export function hasPermission(
  roleOrMask: string | number | null | undefined,
  cap: CapabilityName,
): boolean {
  return hasCapPermission(roleOrMask, cap);
}

// R2-38 read-only revocation checker (alongside Bearer, never replacing it).
// Reads revoked_tokens/{uid} {revokedAt} via Admin SDK with in-memory TTL;
// missing doc or read failure => not revoked (fail-open for availability,
// revocation enforcement happens on next cache refresh + signOut write path).
const revokedCache = new Map<string, { revokedAt: number; at: number }>();
const REVOKED_CACHE_TTL_MS = 5 * 60 * 1000;

export async function isRevoked(uid: string, issuedAtMs?: number): Promise<boolean> {
  if (!uid) return false;
  const now = Date.now();
  const cached = revokedCache.get(uid);
  let revokedAt = 0;
  if (cached && now - cached.at < REVOKED_CACHE_TTL_MS) {
    revokedAt = cached.revokedAt;
  } else {
    try {
      const snap = await getAdminDb().collection('revoked_tokens').doc(uid).get();
      revokedAt = snap.exists ? Number((snap.data() as Record<string, unknown>)?.revokedAt ?? 0) : 0;
      if (!Number.isFinite(revokedAt)) revokedAt = 0;
      revokedCache.set(uid, { revokedAt, at: now });
    } catch {
      return false;
    }
  }
  if (!revokedAt) return false;
  if (typeof issuedAtMs === 'number' && Number.isFinite(issuedAtMs)) return revokedAt > issuedAtMs;
  return true;
}

interface AuthResult {
  uid: string;
  email: string | null;
  role?: string | null;
}

function isRequest(value: unknown): value is Request {
  return typeof value === 'object' && value !== null && 'headers' in value;
}

function failureKey(tokenOrRequest: string | Request): string {
  if (isRequest(tokenOrRequest)) {
    const forwarded = tokenOrRequest.headers.get('x-forwarded-for');
    return forwarded ? forwarded : 'unknown-ip';
  }
  return 'raw-token';
}

export async function verifyFirebaseToken(token: string): Promise<AuthResult | null>;
export async function verifyFirebaseToken(request: Request): Promise<AuthResult | null>;
export async function verifyFirebaseToken(tokenOrRequest: string | Request): Promise<AuthResult | null> {
  let idToken: string | null = null;

  if (typeof tokenOrRequest === 'string') {
    idToken = tokenOrRequest;
  } else {
    const authHeader = tokenOrRequest.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      logAuthFailure(`auth:${failureKey(tokenOrRequest)}`, 'missing_bearer_header');
      return null;
    }
    idToken = authHeader.slice(7);
  }

  if (!idToken) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    if (typeof tokenOrRequest !== 'string') {
      logAuthFailure(`auth:${failureKey(tokenOrRequest)}`, 'invalid_token');
    }
    return null;
  }
}

export async function verifyFirebaseTokenWithRole(
  tokenOrRequest: string | Request,
  requiredRole: 'executive' | 'commander' | 'gladiator',
): Promise<AuthResult | null> {
  let idToken: string | null = null;

  if (typeof tokenOrRequest === 'string') {
    idToken = tokenOrRequest;
  } else {
    const authHeader = tokenOrRequest.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      logAuthFailure(`auth:${failureKey(tokenOrRequest)}`, 'missing_bearer_header');
      return null;
    }
    idToken = authHeader.slice(7);
  }

  if (!idToken) return null;

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    if (typeof tokenOrRequest !== 'string') {
      logAuthFailure(`auth:${failureKey(tokenOrRequest)}`, 'invalid_token');
    }
    return null;
  }

  // Determine the user's role: check token customClaims first, then Firestore.
  // Single Firestore read reused for both role and mustChangePassword (TOCTOU fix).
  try {
    let role: string | undefined;
    let cachedUserDoc: DocumentSnapshot | null = null;
    if (typeof decoded.customClaims !== 'undefined' && decoded.customClaims?.role) {
      role = decoded.customClaims.role as string;
    } else {
      const userDoc = await getAdminDb().collection('users').doc(decoded.uid).get();
      if (!userDoc.exists) return null;
      role = userDoc.data()?.role;
      cachedUserDoc = userDoc;
    }
    if (role !== requiredRole) {
      if (typeof tokenOrRequest !== 'string') {
        logAuthFailure(`role:${decoded.uid}`, `role_mismatch:expected_${requiredRole}`);
      }
      return null;
    }
    // Users under a forced password change may not use the platform until
    // they set a new password through /api/auth/change-password.
    // If role came from customClaims we still need to check mustChangePassword via Firestore.
    if (!cachedUserDoc) {
      cachedUserDoc = await getAdminDb().collection('users').doc(decoded.uid).get();
    }
    if (cachedUserDoc.exists && cachedUserDoc.data()?.mustChangePassword === true) {
      if (typeof tokenOrRequest !== 'string') {
        logAuthFailure(`auth:${decoded.uid}`, 'must_change_password');
      }
      return null;
    }

    return { uid: decoded.uid, email: decoded.email ?? null, role };
  } catch {
    return null;
  }
}

export async function verifyFirebaseTokenWithAnyRole(
  tokenOrRequest: string | Request,
  roles: readonly ('executive' | 'commander' | 'gladiator')[],
): Promise<(AuthResult & { role: string }) | null> {
  let idToken: string | null = null;

  if (typeof tokenOrRequest === 'string') {
    idToken = tokenOrRequest;
  } else {
    const authHeader = tokenOrRequest.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      logAuthFailure(`auth:${failureKey(tokenOrRequest)}`, 'missing_bearer_header');
      return null;
    }
    idToken = authHeader.slice(7);
  }

  if (!idToken) return null;

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    if (typeof tokenOrRequest !== 'string') {
      logAuthFailure(`auth:${failureKey(tokenOrRequest)}`, 'invalid_token');
    }
    return null;
  }

  try {
    const userDoc = await getAdminDb().collection('users').doc(decoded.uid).get();
    if (!userDoc.exists) return null;
    const role = userDoc.data()?.role as string;
    if (!(roles as readonly string[]).includes(role)) {
      if (typeof tokenOrRequest !== 'string') {
        logAuthFailure(`role:${decoded.uid}`, `role_mismatch:allowed_${roles.join('|')}`);
      }
      return null;
    }
    // Users under a forced password change may not use the platform until
    // they set a new password through /api/auth/change-password.
    if (userDoc.data()?.mustChangePassword === true) {
      if (typeof tokenOrRequest !== 'string') {
        logAuthFailure(`auth:${decoded.uid}`, 'must_change_password');
      }
      return null;
    }
    return { uid: decoded.uid, email: decoded.email ?? null, role };
  } catch {
    return null;
  }
}
