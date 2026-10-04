// SIH-26242 RPL — shared pack-consistency recomputation (P15).
// Single source of truth for the inter-assessor agreement computation.
// The consistency GET route delegates here; the assess POST hook awaits it.

import { getAdminDb } from '@/lib/firebase-admin';
import { computeKappa } from '@/lib/rpl/kappa';
import { sanitizeRplDocId } from '@/lib/rpl/rpl-collections';
import type {
  AssessmentItem,
  ConsistencyReport,
  RPLAssessmentDoc,
  RPLConsistencyDoc,
} from '@/lib/rpl/types';

interface HistoryEntry {
  at: number;
  kappa: number;
}

interface ScoredAssessment {
  docId: string;
  assessorId: string;
  workerId: string;
  aiSuggestionUsed: boolean;
  scores: Map<string, number>;
  texts: Map<string, string>;
}

function isValidScore(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function safeKappa(
  a: number[],
  b: number[],
): { kappa: number; confidence: [number, number]; interpretation: string } | null {
  if (a.length < 2 || b.length < 2 || a.length !== b.length) return null;
  try {
    const r = computeKappa(a, b);
    return r;
  } catch {
    return null;
  }
}

/**
 * recomputePackConsistency — the SAME computation the consistency GET route
 * performs: group submitted non-template assessments by worker (>= 2
 * assessors), per-pair + per-criterion kappas, unassisted/assisted split on
 * aiSuggestionUsed, history cap 20, set-merge store. Returns the report.
 */
export async function recomputePackConsistency(packId: string): Promise<ConsistencyReport> {
  const db = getAdminDb();

  // Single-field query only (no composite index); status/template filtered in memory.
  const snap = await db.collection('rpl_assessments').where('packId', '==', packId).get();
  const submittedDocs = snap.docs.filter((d) => {
    const data = d.data() as Partial<RPLAssessmentDoc>;
    return data.status === 'submitted' && data.isTemplate !== true;
  });
  const assessmentCount = submittedDocs.length;

  // Fetch items subcollections for each submitted assessment.
  const scored: ScoredAssessment[] = [];
  await Promise.all(
    submittedDocs.map(async (d) => {
      const data = d.data() as Partial<RPLAssessmentDoc>;
      const assessorId = typeof data.assessorId === 'string' ? data.assessorId : '';
      const workerId = typeof data.workerId === 'string' ? data.workerId : '';
      if (!assessorId || !workerId) return;
      const aiSuggestionUsed = data.aiSuggestionUsed === true;
      let itemsSnap;
      try {
        itemsSnap = await db.collection('rpl_assessments').doc(d.id).collection('items').get();
      } catch {
        return;
      }
      const scores = new Map<string, number>();
      const texts = new Map<string, string>();
      for (const itemDoc of itemsSnap.docs) {
        const item = itemDoc.data() as Partial<AssessmentItem>;
        const itemId = typeof item.itemId === 'string' ? item.itemId : itemDoc.id;
        if (!itemId) continue;
        if (isValidScore(item.rubricScore)) {
          scores.set(itemId, item.rubricScore as number);
          if (typeof item.criterionText === 'string' && item.criterionText) {
            texts.set(itemId, item.criterionText);
          }
        }
      }
      if (scores.size === 0) return;
      scored.push({ docId: d.id, assessorId, workerId, aiSuggestionUsed, scores, texts });
    }),
  );

  // Group by workerId; keep workers with >= 2 distinct assessors.
  const byWorker = new Map<string, ScoredAssessment[]>();
  for (const s of scored) {
    const list = byWorker.get(s.workerId) ?? [];
    list.push(s);
    byWorker.set(s.workerId, list);
  }
  const eligibleWorkers = [...byWorker.values()].filter((list) => {
    const distinct = new Set(list.map((s) => s.assessorId));
    return distinct.size >= 2;
  });

  // Pooled rating pools.
  const overallA: number[] = [];
  const overallB: number[] = [];
  const unassistedA: number[] = [];
  const unassistedB: number[] = [];
  const assistedA: number[] = [];
  const assistedB: number[] = [];
  const pairPools = new Map<string, { assessorA: string; assessorB: string; a: number[]; b: number[] }>();
  const criterionPools = new Map<string, { a: number[]; b: number[]; text?: string }>();

  for (const workerAssessments of eligibleWorkers) {
    for (let i = 0; i < workerAssessments.length; i++) {
      for (let j = i + 1; j < workerAssessments.length; j++) {
        const left = workerAssessments[i];
        const right = workerAssessments[j];
        if (left.assessorId === right.assessorId) continue;
        const key = pairKey(left.assessorId, right.assessorId);
        const [assessorA, assessorB] =
          left.assessorId < right.assessorId
            ? [left.assessorId, right.assessorId]
            : [right.assessorId, left.assessorId];
        // Order ratings consistently: A-side = assessorA.
        const aFirst = left.assessorId === assessorA;
        const aScores = aFirst ? left.scores : right.scores;
        const bScores = aFirst ? right.scores : left.scores;

        const commonIds = [...aScores.keys()].filter((id) => bScores.has(id));
        if (commonIds.length === 0) continue;

        const pairA: number[] = [];
        const pairB: number[] = [];
        for (const id of commonIds) {
          const va = aScores.get(id) as number;
          const vb = bScores.get(id) as number;
          pairA.push(va);
          pairB.push(vb);
          overallA.push(va);
          overallB.push(vb);
          const bothUnassisted = left.aiSuggestionUsed === false && right.aiSuggestionUsed === false;
          const bothAssisted = left.aiSuggestionUsed === true && right.aiSuggestionUsed === true;
          if (bothUnassisted) {
            unassistedA.push(va);
            unassistedB.push(vb);
          } else if (bothAssisted) {
            assistedA.push(va);
            assistedB.push(vb);
          }
          // Per-criterion pool (same itemId across the pair).
          const c = criterionPools.get(id) ?? { a: [], b: [], text: undefined };
          c.a.push(va);
          c.b.push(vb);
          const text = left.texts.get(id) ?? right.texts.get(id);
          if (text && !c.text) c.text = text;
          criterionPools.set(id, c);
        }

        const entry = pairPools.get(key) ?? { assessorA, assessorB, a: [], b: [] };
        entry.a.push(...pairA);
        entry.b.push(...pairB);
        pairPools.set(key, entry);
      }
    }
  }

  const overall = safeKappa(overallA, overallB);
  const overallKappa = overall?.kappa ?? 0;
  const interpretation = (overall?.interpretation ?? 'Poor') as ConsistencyReport['interpretation'];
  const confidence: [number, number] = overall?.confidence ?? [0, 0];

  const unassisted = safeKappa(unassistedA, unassistedB);
  const assisted = safeKappa(assistedA, assistedB);
  const unassistedKappa: number | null = unassisted ? unassisted.kappa : null;
  const assistedKappa: number | null = assisted ? assisted.kappa : null;

  const assessorPairs = [...pairPools.values()]
    .map((p) => {
      const r = safeKappa(p.a, p.b);
      return r ? { assessorA: p.assessorA, assessorB: p.assessorB, kappa: r.kappa } : null;
    })
    .filter((x): x is { assessorA: string; assessorB: string; kappa: number } => x !== null)
    .sort((x, y) => x.assessorA.localeCompare(y.assessorA) || x.assessorB.localeCompare(y.assessorB));

  const perCriterion = [...criterionPools.entries()]
    .map(([criterionId, pool]) => {
      const r = safeKappa(pool.a, pool.b);
      if (!r) return null;
      return pool.text
        ? { criterionId, criterionText: pool.text, kappa: r.kappa }
        : { criterionId, kappa: r.kappa };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((x, y) => x.criterionId.localeCompare(y.criterionId));

  const computedAt = Date.now();

  const report: ConsistencyReport = {
    packId,
    overallKappa,
    interpretation,
    confidence,
    assessorPairs,
    perCriterion,
    unassistedKappa,
    assistedKappa,
    assessmentCount,
    computedAt,
  };

  // Maintain history (capped at 20) in the stored doc.
  let history: HistoryEntry[] = [];
  try {
    const existing = await db.collection('rpl_consistency').doc(sanitizeRplDocId(packId)).get();
    if (existing.exists) {
      const data = existing.data() as Partial<RPLConsistencyDoc> & { history?: HistoryEntry[] };
      if (Array.isArray(data.history)) {
        history = data.history
          .filter((h) => typeof h?.at === 'number' && typeof h?.kappa === 'number')
          .slice(-20);
      }
    }
  } catch {
    history = [];
  }
  history = [...history, { at: computedAt, kappa: overallKappa }].slice(-20);

  const docToStore = {
    packId,
    kappa: overallKappa,
    interpretation,
    confidenceLower: confidence[0],
    confidenceUpper: confidence[1],
    computedAt,
    assessorPairs,
    perCriterion: perCriterion.map((c) => ({ criterionId: c.criterionId, kappa: c.kappa })),
    unassistedKappa: unassistedKappa ?? undefined,
    assistedKappa: assistedKappa ?? undefined,
    assessmentCount,
    history,
  } as RPLConsistencyDoc & { history: HistoryEntry[] };

  try {
    await db.collection('rpl_consistency').doc(sanitizeRplDocId(packId)).set(docToStore, { merge: true });
  } catch (err) {
    console.error('[Consistency recompute] failed to persist rpl_consistency doc:', err);
  }

  return report;
}
