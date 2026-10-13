// SIH-26242 RPL — canonical role capability map (additive, single source).
//
// The app has two role vocabularies that must stay equivalent:
//   RPL-native:  candidate / assessor / admin   (assigned via RPL_*_EMAILS env)
//   Legacy:      gladiator / commander / executive (shared Firebase project)
//
// Equivalence: admin == executive, assessor == commander, candidate == gladiator.
// Every RPL guard MUST accept both vocabularies. Forgetting the RPL-native side
// is what 401'd the env-assigned admin/assessor accounts from section 5.2.
//
// Additive-only: legacy roles keep every permission they had; this file only
// ADDS the missing RPL-native equivalents. Existing e2e (exec/commander/glad1)
// keeps passing unchanged.
export const RPL_ADMIN_ROLES = ['admin', 'executive'] as const;
export const RPL_ASSESSOR_ROLES = ['assessor', 'commander', 'executive', 'admin'] as const;
export const RPL_WORKER_ROLES = ['candidate', 'gladiator', 'commander', 'executive'] as const;

export type RplRole = string;

export function isRplAdmin(role: RplRole | null | undefined): boolean {
  return role === 'admin' || role === 'executive';
}

export function isRplAssessor(role: RplRole | null | undefined): boolean {
  return role === 'assessor' || role === 'commander' || role === 'executive' || role === 'admin';
}

export function isRplPrivileged(role: RplRole | null | undefined): boolean {
  // Anyone who may read another worker's record: assessors + admins (both vocabs).
  return isRplAssessor(role);
}

export function isRplWorker(role: RplRole | null | undefined): boolean {
  return role === 'candidate' || role === 'gladiator';
}

export function canUseDeclare(role: RplRole | null | undefined): boolean {
  // Self-declaration wizard: workers + legacy privileged (they declare as workers).
  return (
    role === 'candidate' ||
    role === 'gladiator' ||
    role === 'commander' ||
    role === 'executive'
  );
}
