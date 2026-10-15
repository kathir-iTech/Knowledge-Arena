import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import {
  RPL_ASSESSMENTS,
  RPL_CERTIFICATIONS,
  RPL_CONSISTENCY,
  RPL_WORKERS,
} from '@/lib/rpl/rpl-collections';
import { storedAssessmentScore } from '@/lib/rpl/scores';
import type {
  ActivityEvent,
  AdminOverview,
  AssessorLeaderboardRow,
  PackPerformanceRow,
} from '@/lib/rpl/types';

export const runtime = 'nodejs';

// SIH-26242 RPL admin overview (Executive or admin).
// Aggregation rules:
// - Only single-field where() / orderBy() queries are used; all cross-field
//   filtering, joins and aggregation happen in memory (firestore.indexes.json
//   is never touched).
// - Template assessment docs (isTemplate == true) are excluded everywhere.

type DocData = Record<string, unknown>;

function asRecord(value: unknown): DocData {
  if (typeof value === 'object' && value !== null) return value as DocData;
  return {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function interpretationForKappa(kappa: number | null, stored: unknown): string {
  if (typeof stored === 'string' && stored.length > 0) return stored;
  if (kappa === null) return 'No data';
  if (kappa < 0.2) return 'Poor';
  if (kappa < 0.4) return 'Fair';
  if (kappa < 0.6) return 'Moderate';
  if (kappa < 0.8) return 'Substantial';
  return 'Almost perfect';
}

/**
 * avgScore definition: the shared read-side helper
 * storedAssessmentScore() (src/lib/rpl/scores.ts) — prefer numeric
 * `overallScore` (always written by POST /api/rpl/assess since the D2 fix),
 * else mean of `unitScores` entries, else mean of the raw `scores` map.
 * Assessments with no usable score are skipped; pack avgScore is the mean
 * of the per-assessment scores, or 0 when none carries a score.
 */

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['executive', 'admin']);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:admin-overview:${auth.uid}`, {
      maxRequests: 30,
      windowMs: 60000,
      message: 'Too many overview requests. Please slow down.',
    });
    if (rl) return rl;

    const db = getAdminDb();
    const nowMs = Date.now();
    const now = new Date(nowMs);
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    // Single-field queries only; status/template/month filtering is in memory.
    const [workerCountSnap, draftSnap, submittedSnap, consistencySnap, certMonthSnap] =
      await Promise.all([
        db.collection(RPL_WORKERS).count().get(),
        db.collection(RPL_ASSESSMENTS).where('status', '==', 'draft').get(),
        db.collection(RPL_ASSESSMENTS).where('status', '==', 'submitted').get(),
        db.collection(RPL_CONSISTENCY).get(),
        db.collection(RPL_CERTIFICATIONS).where('signedAt', '>=', firstOfMonth).get(),
      ]);

    const totalWorkers = workerCountSnap.data().count;

    const submittedDocs = submittedSnap.docs.filter(
      (d) => asRecord(d.data()).isTemplate !== true,
    );
    const assessmentsInProgress = draftSnap.docs.filter(
      (d) => asRecord(d.data()).isTemplate !== true,
    ).length;
    const assessmentsCompleted = submittedDocs.length;

    const submitted = submittedDocs.map((d) => ({ id: d.id, data: asRecord(d.data()) }));

    const consistencyDocs = consistencySnap.docs.map((d) => {
      const data = asRecord(d.data());
      // Doc IDs are sanitized (ELE/Q1301 -> ELE_Q1301); the canonical pack
      // code lives in the packId FIELD — key by that so pack lookups hit.
      return { packId: nonEmptyString(data.packId) ?? d.id, data };
    });
    const consistencyByPack = new Map(consistencyDocs.map((c) => [c.packId, c.data]));

    // Display names for assessor UIDs (judges see names, not raw UIDs).
    // One batched read of users/{uid}; unknown IDs fall back to the raw UID.
    const nameByUid = new Map<string, string>();
    {
      const ids = new Set<string>();
      for (const s of submitted) {
        const aid = nonEmptyString(s.data.assessorId);
        if (aid) ids.add(aid);
      }
      for (const { data } of consistencyDocs) {
        const pairs: unknown[] = Array.isArray(data.assessorPairs) ? data.assessorPairs : [];
        for (const raw of pairs) {
          const pair = asRecord(raw);
          for (const id of [nonEmptyString(pair.assessorA), nonEmptyString(pair.assessorB)]) {
            if (id) ids.add(id);
          }
        }
      }
      const refs = [...ids].slice(0, 100).map((id) => db.collection('users').doc(id));
      if (refs.length > 0) {
        const snaps = await db.getAll(...refs).catch(() => []);
        for (const snap of snaps) {
          if (!snap.exists) continue;
          const data = asRecord(snap.data());
          const name = nonEmptyString(data.name) ?? nonEmptyString(data.email)?.split('@')[0] ?? null;
          if (name) nameByUid.set(snap.id, name);
        }
      }
    }
    function displayName(uid: string): string {
      return nameByUid.get(uid) ?? uid;
    }

    const kappaValues: number[] = [];
    for (const { data } of consistencyDocs) {
      const k = finiteNumber(data.kappa);
      if (k !== null) kappaValues.push(k);
    }
    const averageKappa = mean(kappaValues);

    // Single-field range query above; month membership re-checked in memory.
    const certificationsThisMonth = certMonthSnap.docs.filter((d) => {
      const signedAt = finiteNumber(asRecord(d.data()).signedAt);
      return signedAt !== null && signedAt >= firstOfMonth;
    }).length;

    const packs: PackPerformanceRow[] = NSQF_PACKS.map((pack) => {
      const forPack = submitted.filter((s) => s.data.packId === pack.id);
      const workerIds = new Set<string>();
      const perAssessmentScores: number[] = [];
      for (const s of forPack) {
        const workerId = nonEmptyString(s.data.workerId);
        if (workerId) workerIds.add(workerId);
        const score = storedAssessmentScore(s.data);
        if (score !== null) perAssessmentScores.push(score);
      }
      const consistency = consistencyByPack.get(pack.id);
      const kappa = consistency ? finiteNumber(consistency.kappa) : null;
      return {
        packId: pack.id,
        title: pack.title,
        nsqfLevel: pack.nsqfLevel,
        workersAssessed: workerIds.size,
        avgScore: mean(perAssessmentScores) ?? 0,
        kappa,
        interpretation: interpretationForKappa(kappa, consistency?.interpretation),
        isDemoData: consistency?.isDemoData === true,
      };
    });

    // Recent activity: single-field orderBy queries (no composite where+orderBy),
    // filtered in memory, merged, sorted desc, sliced to 10.
    const [declarationSnap, recentSubmittedSnap, recentCertSnap] = await Promise.all([
      db.collection(RPL_WORKERS).orderBy('declarationSubmittedAt', 'desc').limit(10).get(),
      db.collection(RPL_ASSESSMENTS).orderBy('submittedAt', 'desc').limit(10).get(),
      db.collection(RPL_CERTIFICATIONS).orderBy('signedAt', 'desc').limit(10).get(),
    ]);

    const events: ActivityEvent[] = [];

    for (const d of declarationSnap.docs) {
      const data = asRecord(d.data());
      const at = finiteNumber(data.declarationSubmittedAt);
      if (at === null) continue;
      const name = nonEmptyString(data.name) ?? d.id;
      events.push({ type: 'declaration', message: `Declaration submitted by ${name}`, at, ref: d.id });
    }

    for (const d of recentSubmittedSnap.docs) {
      const data = asRecord(d.data());
      if (data.status !== 'submitted' || data.isTemplate === true) continue;
      const at = finiteNumber(data.submittedAt);
      if (at === null) continue;
      const packId = nonEmptyString(data.packId) ?? 'unknown pack';
      const assessorId = nonEmptyString(data.assessorId) ?? 'unknown assessor';
      events.push({
        type: 'assessment',
        message: `Assessment submitted for ${packId} by ${displayName(assessorId)}`,
        at,
        ref: d.id,
      });
    }

    for (const d of recentCertSnap.docs) {
      const data = asRecord(d.data());
      const at = finiteNumber(data.signedAt);
      if (at === null) continue;
      const workerId = nonEmptyString(data.workerId) ?? d.id;
      events.push({
        type: 'certification',
        message: `Certification signed for worker ${workerId}`,
        at,
        ref: d.id,
      });
    }

    for (const { packId, data } of consistencyDocs) {
      const kappa = finiteNumber(data.kappa);
      if (kappa === null || kappa >= 0.4) continue;
      const at = finiteNumber(data.computedAt) ?? nowMs;
      const demoSuffix = data.isDemoData === true ? ' (demo data)' : '';
      events.push({
        type: 'kappa-alert',
        message: `Low agreement (κ=${kappa.toFixed(2)}) on pack ${packId}${demoSuffix}`,
        at,
        ref: packId,
      });
    }

    events.sort((a, b) => b.at - a.at);
    const recentActivity = events.slice(0, 10);

    // Assessor leaderboard from submitted assessments + pair kappas.
    const byAssessor = new Map<string, { assessments: number; kappas: number[]; hasHistory: boolean }>();
    for (const s of submitted) {
      const assessorId = nonEmptyString(s.data.assessorId);
      if (!assessorId) continue;
      const acc = byAssessor.get(assessorId) ?? { assessments: 0, kappas: [], hasHistory: false };
      acc.assessments += 1;
      byAssessor.set(assessorId, acc);
    }
    for (const { data } of consistencyDocs) {
      const pairs: unknown[] = Array.isArray(data.assessorPairs) ? data.assessorPairs : [];
      const history: unknown[] = Array.isArray(data.history) ? data.history : [];
      const hasHistory = history.length > 0;
      for (const raw of pairs) {
        const pair = asRecord(raw);
        const kappa = finiteNumber(pair.kappa);
        if (kappa === null) continue;
        const ids = [nonEmptyString(pair.assessorA), nonEmptyString(pair.assessorB)];
        for (const id of ids) {
          if (!id) continue;
          const acc = byAssessor.get(id) ?? { assessments: 0, kappas: [], hasHistory: false };
          acc.kappas.push(kappa);
          if (hasHistory) acc.hasHistory = true;
          byAssessor.set(id, acc);
        }
      }
    }

    const assessors: AssessorLeaderboardRow[] = [...byAssessor.entries()]
      .map(([assessorId, acc]) => {
        const avgAgreement = mean(acc.kappas);
        let trend: AssessorLeaderboardRow['trend'] = 'stable';
        // Trend is computed from the stored pair-kappa history when present
        // (a consistency doc involving this assessor carries a history array);
        // otherwise 'stable'. Latest = most recently collected pair kappa.
        if (acc.hasHistory && acc.kappas.length > 0 && avgAgreement !== null) {
          const latest = acc.kappas[acc.kappas.length - 1];
          if (latest < avgAgreement - 0.1) trend = 'declining';
          else if (latest > avgAgreement + 0.1) trend = 'improving';
        }
        return { assessorId, assessorName: nameByUid.get(assessorId), assessments: acc.assessments, avgAgreement, trend };
      })
      .sort((x, y) => y.assessments - x.assessments || x.assessorId.localeCompare(y.assessorId));

    const overview: AdminOverview = {
      totalWorkers,
      assessmentsInProgress,
      assessmentsCompleted,
      averageKappa,
      certificationsThisMonth,
      packs,
      recentActivity,
      assessors,
      // Owned by a later agent (alerts API); page prepends an Alerts section.
      activeAlerts: [],
    };

    return NextResponse.json(overview);
  } catch (err) {
    console.error('[RPL Admin Overview] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
