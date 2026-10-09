// Phase A2 — role custom claim is the ONLY role source the edge middleware can
// read (it cannot touch Firestore), so the session cookie must carry it.
//
// Roles live in users/{uid}.role, but setCustomUserClaims() is only called from
// the Executive admin route — a Google sign-in or a seeded account therefore
// gets a cookie with no `role` claim and every portal route bounces back to
// /login. This module is the single, side-effect-free decision point for
// repairing that at session-mint time (see src/app/api/auth/session/route.ts).

export const VALID_ROLES = ['executive', 'commander', 'gladiator'] as const;
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
  /** decoded.customClaims.role from the ID token being exchanged */
  claimRole?: unknown;
  /** users/{uid}.role — only read when the claim is unusable */
  docRole?: unknown;
  /** true when the Firestore role lookup threw (readable but unavailable) */
  lookupFailed?: boolean;
}

export function resolveSessionRole(input: SessionRoleInput): SessionRoleDecision {
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
