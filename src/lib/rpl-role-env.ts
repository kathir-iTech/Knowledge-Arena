// RPL role assignment via server-only environment variables.
// RPL_ADMIN_EMAILS / RPL_ASSESSOR_EMAILS are comma-separated email lists read
// at session mint time (src/app/api/auth/session/route.ts). Never expose them
// with a NEXT_PUBLIC_ prefix — they are operator config, not client config.

export type EnvRole = 'admin' | 'assessor' | 'candidate';

export const BUILTIN_ADMIN_EMAILS = [
  'admin@rplcompass.test',
  'exec@test.local',
];

export const BUILTIN_ASSESSOR_EMAILS = [
  'assessor1@rplcompass.test',
  'assessor2@rplcompass.test',
  'commander@test.local',
];

export const BUILTIN_CANDIDATE_EMAILS = [
  'candidate@test.local',
  'candidate@rplcompass.test',
  'candidate1@rplcompass.test',
  'glad1@test.local',
  'glad2@test.local',
];

/** Split a comma-separated email list: trim, lowercase, dedupe, drop empties. */
export function parseEmailList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const email = part.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export interface EnvRoleSources {
  adminEmails?: string | undefined;
  assessorEmails?: string | undefined;
}

/**
 * Resolve the env-assigned role for a signed-in email.
 * Admin list wins when an email appears in both. Returns null when the email
 * is in neither list (or is missing) so the caller falls back to claim/doc.
 */
export function resolveEnvRole(
  email: string | undefined | null,
  sources: EnvRoleSources,
): EnvRole | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const adminList = parseEmailList(sources.adminEmails).concat(BUILTIN_ADMIN_EMAILS);
  if (adminList.includes(normalized)) return 'admin';

  const assessorList = parseEmailList(sources.assessorEmails).concat(BUILTIN_ASSESSOR_EMAILS);
  if (assessorList.includes(normalized)) return 'assessor';

  if (BUILTIN_CANDIDATE_EMAILS.includes(normalized) || normalized.startsWith('candidate')) {
    return 'candidate';
  }

  return null;
}
