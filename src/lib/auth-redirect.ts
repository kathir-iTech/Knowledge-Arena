// Phase 103: single source of truth for post-login role routing.
// Do not scatter dashboardMap copies across components — import from here.
export const ROLE_HOME: Record<string, string> = {
  executive: '/executive/workspace',
  commander: '/commander/dashboard',
  gladiator: '/gladiator/dashboard',
  // RPL Compass roles — see src/lib/session-role.ts VALID_ROLES.
  candidate: '/rpl',
  assessor: '/rpl/assessor',
  admin: '/rpl/admin',
} as const;

export type AppRole =
  | 'executive'
  | 'commander'
  | 'gladiator'
  | 'candidate'
  | 'assessor'
  | 'admin';

export function getRoleHome(role: string | null | undefined): string {
  if (!role) return '/login';
  return ROLE_HOME[role] || '/login';
}

export function isValidRole(role: string | null | undefined): role is AppRole {
  return (
    role === 'executive' ||
    role === 'commander' ||
    role === 'gladiator' ||
    role === 'candidate' ||
    role === 'assessor' ||
    role === 'admin'
  );
}
