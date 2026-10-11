// Phase A2 — role custom claim is the ONLY role source the edge middleware can
// read (it cannot touch Firestore), so the session cookie must carry it.
//
// Roles live in users/{uid}.role, but setCustomUserClaims() is only called from
// the Executive admin route — a Google sign-in or a seeded account therefore
// gets a cookie with no `role` claim and every portal route bounces back to
// /login. This module is the single, side-effect-free decision point for
// repairing that at session-mint time (see src/app/api/auth/session/route.ts).

// candidate = self-serve email/password signup (RPL Compass);
// assessor/admin = assigned via RPL_ASSESSOR_EMAILS / RPL_ADMIN_EMAILS at
// session-mint time (src/lib/rpl-role-env.ts), not via Firestore writes.
export const VALID_ROLES = [
  'executive',
  'commander',
  'gladiator',
  'candidate',
  'assessor',
  'admin',
] as const;
export type AppRole = (typeof VALID_ROLES)[number];

export type SessionRoleAction =
  | 'mint' // claim already carries a valid role — mint the cookie now
  | 'refresh-claims' // claim missing/stale, doc has the role — sync claim, client re-mints
  | 'role-missing' // neither source has a role — nothing safe to mint
  | 'lookup-failed'; // claim missing and the Firestore read threw — retryable

export interface SessionRoleDecision {
  action: SessionRoleAction;
  role: AppRole | null;
}

function isValidClaimRole(raw: unknown): raw is AppRole {
  return typeof raw === 'string' && (VALID_ROLES as readonly string[]).includes(raw.trim());
}

/**
 * Read the `role` custom claim from a verified Firebase token.
 *
 * The Admin SDK (verifyIdToken / verifySessionCookie) merges custom claims at
 * the TOP LEVEL of DecodedIdToken — there is deliberately no `customClaims`
 * property (that is a CLIENT-SDK concept: User.getIdTokenResult().claims).
 * Reading `decoded.customClaims` silently yields undefined, so every session
 * mint looked unsynced and the client looped to CLAIM_SYNC_LOOP.
 */
export function readRoleClaim(decoded: Record<string, unknown> | null | undefined): unknown {
  return decoded?.role;
}

// users/{uid}.role still holds legacy values from early seeds.
export function normalizeDocRole(raw: unknown): AppRole | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value === 'teacher') return 'commander';
  if (value === 'student') return 'gladiator';
  if ((VALID_ROLES as readonly string[]).includes(value)) return value as AppRole;
  return null;
}

export interface SessionRoleInput {
  /** top-level `role` custom claim from the ID token being exchanged */
  claimRole?: unknown;
  /** users/{uid}.role — only read when the claim is unusable */
  docRole?: unknown;
  /** true when the Firestore role lookup threw (readable but unavailable) */
  lookupFailed?: boolean;
  /**
   * Role from RPL_ADMIN_EMAILS / RPL_ASSESSOR_EMAILS (operator config).
   * Authoritative over claim/doc: if it differs from the current claim the
   * claim is re-synced so the middleware cookie always matches.
   */
  envRole?: AppRole | null;
}

export function resolveSessionRole(input: SessionRoleInput): SessionRoleDecision {
  // Env-assigned roles win outright — they are the operator's explicit
  // assignment and must not be stale-claimed or doc-overridden.
  if (input.envRole && (VALID_ROLES as readonly string[]).includes(input.envRole)) {
    const envRole = input.envRole as AppRole;
    if (isValidClaimRole(input.claimRole) && input.claimRole.trim() === envRole) {
      return { action: 'mint', role: envRole };
    }
    return { action: 'refresh-claims', role: envRole };
  }
  // A claim is used verbatim: middleware compares it with ===, so a legacy
  // 'teacher'/'student' claim would still bounce — treat it as absent and
  // overwrite it from the doc instead.
  if (isValidClaimRole(input.claimRole)) {
    return { action: 'mint', role: input.claimRole.trim() as AppRole };
  }
  if (input.lookupFailed) return { action: 'lookup-failed', role: null };
  const docRole = normalizeDocRole(input.docRole);
  if (docRole) return { action: 'refresh-claims', role: docRole };
  return { action: 'role-missing', role: null };
}
