// B2 — human-readable assessment reference codes.
//
// A worker's reference code is what they quote at a physical assessment and
// what the result/status URLs carry (?ref=). It must NEVER be the Firebase UID:
// a UID leaks the account identifier into browser history, shared links and
// screenshots.
//
// This module is intentionally runtime-import-free (only a type-only import)
// so it can be imported directly by `node scripts/test-*.mjs` under Node's
// type-stripping, mirroring src/lib/session-role.ts.
//
// Format: RPL-XXXX-XXXX over an unambiguous alphabet (no 0/O, 1/I/L). 8 random
// characters from a 31-symbol alphabet => 31^8 ≈ 8.5e11 combinations, so a
// uniqueness probe is a formality rather than a collision risk.

import type { Firestore } from 'firebase-admin/firestore';

/**
 * Unambiguous uppercase alphabet: digits 2-9 (no 0/1) and A-Z minus I, L, O.
 * Kept in sync with the regex below and with any UI hint that explains the
 * format to workers.
 */
export const REFERENCE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const REFERENCE_CODE_PREFIX = 'RPL';

const GROUP_SIZE = 4;
const GROUP_COUNT = 2;

/** Matches exactly RPL-XXXX-XXXX (the canonical generated shape). */
export const REFERENCE_CODE_REGEX = new RegExp(
  `^${REFERENCE_CODE_PREFIX}-[${REFERENCE_CODE_ALPHABET}]{${GROUP_SIZE}}-[${REFERENCE_CODE_ALPHABET}]{${GROUP_SIZE}}$`,
);

/**
 * Generate a reference code. `random` is injectable for deterministic tests;
 * it must return [0, 1).
 */
export function generateReferenceCode(random: () => number = Math.random): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUP_COUNT; g += 1) {
    let group = '';
    for (let i = 0; i < GROUP_SIZE; i += 1) {
      const idx = Math.floor(random() * REFERENCE_CODE_ALPHABET.length);
      group += REFERENCE_CODE_ALPHABET[Math.min(Math.max(idx, 0), REFERENCE_CODE_ALPHABET.length - 1)];
    }
    groups.push(group);
  }
  return `${REFERENCE_CODE_PREFIX}-${groups.join('-')}`;
}

/**
 * True only for a canonical generated code. Used to decide whether a stored
 * `assessmentReferenceCode` is a real human code (so we can reuse it) or a
 * legacy UID value (so we must replace it).
 */
export function isReferenceCode(value: unknown): value is string {
  return typeof value === 'string' && REFERENCE_CODE_REGEX.test(value);
}

/** rpl_workers — inlined so this module stays runtime-import-free; keep in sync
 *  with RPL_WORKERS in ./rpl-collections. */
const RPL_WORKERS = 'rpl_workers';

/**
 * Allocate a reference code that is not already used by any worker doc. Uses a
 * single-field where() on assessmentReferenceCode (no composite index needed).
 * Bounded retries, then throws — the caller must surface the failure rather
 * than persist a code that might collide.
 */
export async function allocateReferenceCode(
  db: Firestore,
  attempts = 8,
  random: () => number = Math.random,
): Promise<string> {
  for (let i = 0; i < attempts; i += 1) {
    const code = generateReferenceCode(random);
    const snap = await db
      .collection(RPL_WORKERS)
      .where('assessmentReferenceCode', '==', code)
      .limit(1)
      .get();
    if (snap.empty) return code;
  }
  throw new Error('Could not allocate a unique assessment reference code.');
}
