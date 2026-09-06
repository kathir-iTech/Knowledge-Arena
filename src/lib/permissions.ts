/**
 * R2-33 / Feature 33: Granular RBAC capability masks — pure helper.
 *
 * Coarse roles (`ROLES` in constants.ts) stay source of truth for Firestore
 * rules + `verifyFirebaseTokenWithRole`. Capabilities are a second, additive
 * gate enforced server-side in API routes (never in rules in Set 2, to avoid
 * exploding the 10-get limit).
 *
 * Bit positions are stable; do not reorder. Fits in custom claims (<1KB).
 */

export const CAPABILITIES = {
  quiz_create: 1 << 0,
  quiz_edit: 1 << 1,
  analytics_export: 1 << 2,
  user_ban: 1 << 3,
  bank_edit: 1 << 4,
  bank_read: 1 << 5,
  battle_control: 1 << 6,
  announcements_send: 1 << 7,
} as const;

export type CapabilityName = keyof typeof CAPABILITIES;

export const ROLE_MASKS: Record<string, number> = {
  executive:
    CAPABILITIES.quiz_create |
    CAPABILITIES.quiz_edit |
    CAPABILITIES.analytics_export |
    CAPABILITIES.user_ban |
    CAPABILITIES.bank_edit |
    CAPABILITIES.bank_read |
    CAPABILITIES.battle_control |
    CAPABILITIES.announcements_send,
  commander:
    CAPABILITIES.quiz_create |
    CAPABILITIES.quiz_edit |
    CAPABILITIES.bank_read |
    CAPABILITIES.battle_control,
  gladiator: 0,
};

export function maskForRole(role: string | null | undefined): number {
  if (!role) return 0;
  return ROLE_MASKS[role] ?? 0;
}

/** Pure bitwise check: (RoleMask & CapMask) == CapMask. */
export function hasPermission(
  roleOrMask: string | number | null | undefined,
  cap: CapabilityName,
): boolean {
  const mask = typeof roleOrMask === 'number' ? roleOrMask : maskForRole(roleOrMask);
  const need = CAPABILITIES[cap];
  return (mask & need) === need;
}
