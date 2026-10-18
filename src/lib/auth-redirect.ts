// Phase 103: single source of truth for post-login role routing.
// Do not scatter dashboardMap copies across components — import from here.
//
// SIH-26242 (branch sih-26242-rpl): this branch is RPL-COMPASS ONLY. Every
// legacy Quorena role is routed into the RPL app (they are treated as a
// candidate for RPL purposes); the Quorena portals are unreachable here.
// main keeps the Quorena homes — never merge this mapping to main.
export const ROLE_HOME: Record<string, string> = {
  // Canonical RPL roles:
  executive: '/rpl/admin',
  admin: '/rpl/admin',
  commander: '/rpl/assessor',
  assessor: '/rpl/assessor',
  gladiator: '/rpl',
  candidate: '/rpl',
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
