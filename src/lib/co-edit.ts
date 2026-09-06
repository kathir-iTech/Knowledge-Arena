/**
 * R2-37 / Feature 37: Co-commander presence + LWW helpers (NOT CRDT in Set 2).
 *
 * Set-2 collaboration = presence awareness + field-level last-write-wins
 * with `updatedAt` compare + conflict banner. Full OT/CRDT deferred to V2.0.
 * `config/settings` (scoring/governance) is never co-editable in Set 2.
 */

export interface CoEditorPresence {
  uid: string;
  name?: string | null;
  questionId?: string | null;
  updatedAt: number;
}

export function isNewerWrite(aUpdatedAt: number | null | undefined, bUpdatedAt: number | null | undefined): boolean {
  const a = typeof aUpdatedAt === 'number' ? aUpdatedAt : 0;
  const b = typeof bUpdatedAt === 'number' ? bUpdatedAt : 0;
  return a > b;
}

/** Who else is editing the same question right now (excluding self). */
export function coEditorsOnQuestion(
  presences: readonly CoEditorPresence[],
  selfUid: string,
  questionId: string,
): CoEditorPresence[] {
  return presences.filter((p) => p.uid !== selfUid && p.questionId === questionId);
}
