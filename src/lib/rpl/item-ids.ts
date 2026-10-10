// SIH-26242 RPL track — THE shared item-id scheme (D4).
//
// One scheme for every producer/consumer of assessment items:
//   itemId field + UI input name : `${unitId}::p${idx}` (performance)
//                                  `${unitId}::k${idx}` (knowledge)
//   Firestore subcollection doc id: firestoreItemId(itemId) — '/' -> '_'
//     (Firestore doc ids cannot contain '/'; the FIELD keeps the canonical id)
//
// Consumers wired to this module: the assess page (lookup + input names),
// POST /api/rpl/assess (doc ids), the demo seeder, tests/rpl-e2e.spec.ts and
// scripts/rpl/migrate-item-ids.mjs (legacy-scheme parser). Type-only imports
// so plain-Node scripts can strip-load it.
//
// Legacy schemes this replaces (read-only helpers below):
//   seeder: `ELE-N1301-p0`  (unitId '/' -> '-', '-p' + index)
//   e2e:    `ELE-N1301-p0` / `ELE-N1301-k0`

export function performanceItemId(unitId: string, index: number): string {
  return `${unitId}::p${index}`;
}

export function knowledgeItemId(unitId: string, index: number): string {
  return `${unitId}::k${index}`;
}

export function itemIdFor(
  unitId: string,
  kind: 'performance' | 'knowledge',
  index: number,
): string {
  return kind === 'performance' ? performanceItemId(unitId, index) : knowledgeItemId(unitId, index);
}

/** Firestore subcollection doc id for an itemId ('/' is illegal in doc ids). */
export function firestoreItemId(itemId: string): string {
  return itemId.replace(/\//g, '_').slice(0, 200) || 'item';
}

/** True when the id is already on the canonical `::` scheme. */
export function isCanonicalItemId(itemId: string): boolean {
  return /::[pk]\d+$/.test(itemId);
}

/**
 * Parse a LEGACY id (`...-p3` / `...-k0`). Unit id is NOT recovered here —
 * item docs carry a `unitId` field; only kind + index are embedded in the id.
 * Returns null for canonical or unparseable ids (callers must skip loudly,
 * never guess).
 */
export function parseLegacyItemId(
  itemId: string,
): { kind: 'performance' | 'knowledge'; index: number } | null {
  const m = /^(?:.*)-(p|k)(\d+)$/.exec(itemId);
  if (!m) return null;
  return { kind: m[1] === 'p' ? 'performance' : 'knowledge', index: Number(m[2]) };
}
