// SIH-26242 RPL — kappa threshold monitor (P15).
// Pure Admin-SDK read, no writes. Returns KappaAlert[] for one pack.

import { getAdminDb } from '@/lib/firebase-admin';
import { RPL_CONSISTENCY, sanitizeRplDocId } from '@/lib/rpl/rpl-collections';
import type { KappaAlert, RPLConsistencyDoc } from '@/lib/rpl/types';

interface HistoryEntry {
  at: number;
  kappa: number;
}

type StoredConsistency = Partial<RPLConsistencyDoc> & {
  history?: HistoryEntry[];
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DROP_THRESHOLD = 0.15;

function finiteKappa(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * checkKappaThresholds — read rpl_consistency/{packId}, emit alerts:
 * - overall kappa < 0.4 -> warning; < 0.2 -> critical (escalation, not duplicate)
 *   with recommendedAction exactly "Assessor calibration session recommended."
 * - any assessorPairs entry < 0.3 -> warning with assessorId set
 * - drop > 0.15 vs the most recent history entry within 7 days -> warning
 * Returns [] when the doc is missing. createdAt = Date.now(). No writes.
 */
export async function checkKappaThresholds(packId: string): Promise<KappaAlert[]> {
  const db = getAdminDb();
  const snap = await db.collection(RPL_CONSISTENCY).doc(sanitizeRplDocId(packId)).get().catch(() => null);
  if (!snap || !snap.exists) return [];
  const data = snap.data() as StoredConsistency | undefined;
  if (!data) return [];

  const now = Date.now();
  const alerts: KappaAlert[] = [];
  const kappa = finiteKappa(data.kappa);

  if (kappa !== null) {
    if (kappa < 0.2) {
      alerts.push({
        severity: 'critical',
        packId,
        message: `Critical low agreement (κ=${kappa.toFixed(3)}) on pack ${packId}.`,
        recommendedAction: 'Assessor calibration session recommended.',
        createdAt: now,
      });
    } else if (kappa < 0.4) {
      alerts.push({
        severity: 'warning',
        packId,
        message: `Low agreement (κ=${kappa.toFixed(3)}) on pack ${packId}.`,
        recommendedAction: 'Review assessor scoring and consider a calibration review.',
        createdAt: now,
      });
    }
  }

  if (Array.isArray(data.assessorPairs)) {
    for (const raw of data.assessorPairs) {
      if (typeof raw !== 'object' || raw === null) continue;
      const pair = raw as { assessorA?: unknown; assessorB?: unknown; kappa?: unknown };
      const pairKappa = finiteKappa(pair.kappa);
      if (pairKappa === null || pairKappa >= 0.3) continue;
      const a = typeof pair.assessorA === 'string' ? pair.assessorA : '';
      const b = typeof pair.assessorB === 'string' ? pair.assessorB : '';
      if (!a && !b) continue;
      const assessorId = a && b ? `${a},${b}` : a || b;
      alerts.push({
        severity: 'warning',
        packId,
        assessorId,
        message: `Low pair agreement (κ=${pairKappa.toFixed(3)}) between ${a || '?'} and ${b || '?'} on pack ${packId}.`,
        recommendedAction: 'Review scoring differences and consider joint calibration.',
        createdAt: now,
      });
    }
  }

  if (kappa !== null && Array.isArray(data.history) && data.history.length > 0) {
    const computedAt =
      typeof data.computedAt === 'number' && Number.isFinite(data.computedAt)
        ? (data.computedAt as number)
        : now;
    const candidates = (data.history as unknown[])
      .filter(
        (h): h is HistoryEntry =>
          typeof h === 'object' &&
          h !== null &&
          typeof (h as HistoryEntry).at === 'number' &&
          typeof (h as HistoryEntry).kappa === 'number' &&
          Number.isFinite((h as HistoryEntry).at) &&
          Number.isFinite((h as HistoryEntry).kappa),
      )
      .filter((h) => h.at < computedAt && now - h.at <= SEVEN_DAYS_MS)
      .sort((x, y) => y.at - x.at);
    const baseline = candidates[0];
    if (baseline) {
      const drop = baseline.kappa - kappa;
      if (drop > DROP_THRESHOLD) {
        alerts.push({
          severity: 'warning',
          packId,
          message: `Agreement dropped by ${drop.toFixed(3)} on pack ${packId} (from ${baseline.kappa.toFixed(3)} to ${kappa.toFixed(3)}).`,
          recommendedAction: 'Investigate recent assessments for scoring drift.',
          createdAt: now,
        });
      }
    }
  }

  return alerts;
}
