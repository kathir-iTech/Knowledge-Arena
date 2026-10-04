// SIH-26242 RPL track — competency profile + certification recommendation builders.
// Pure functions only: no Firestore, no auth, no network. Depends solely on
// ./types and ./nsqf-packs (imported as types where possible).

import type {
  AssessmentItem,
  CompetencyProfile,
  RPLCertificationRecommendation,
  UnitMastery,
} from './types';
import type { NSQFQualificationPack } from './nsqf-packs';

// ---------------------------------------------------------------------------
// Local extension (never edit src/lib/rpl/types.ts).
// The substantive recommendation status below is ADVISORY ONLY until an
// executive signs off via POST /api/rpl/certify. `requiresHumanSignoff` is a
// literal `true` (not boolean) so consumers must acknowledge sign-off at the
// type level. Nothing in this file writes certification docs and nothing here
// can approve a worker on its own — that is the never-auto-approve
// enforcement: the only path to an RPLCertificationDoc is the executive-signed
// API route, which recomputes the profile server-side with these same
// functions and stamps executiveUid + signedAt.
// ---------------------------------------------------------------------------
export interface DraftCertificationRecommendation extends RPLCertificationRecommendation {
  requiresHumanSignoff: true;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function statusForScore(score: number): UnitMastery {
  if (score >= 75) return 'competent';
  if (score >= 50) return 'partial';
  return 'not_yet';
}

/**
 * Build a CompetencyProfile for a worker against one qualification pack.
 *
 * Scoring formulas (documented contract):
 * - Performance item score = ((rubricScore - 1) / 3) * 100, so rubric
 *   1 -> 0, 2 -> 33.3, 3 -> 66.7, 4 -> 100. Unscored items (no rubricScore)
 *   are skipped, not zeroed.
 * - Knowledge item score = knowledgePass ? 100 : 0. Unanswered items
 *   (knowledgePass undefined) are skipped, not zeroed.
 * - Unit score = mean of the two side-means with EQUAL weights:
 *   (performanceMean + knowledgeMean) / 2. Fallback when only one side has
 *   scored items: the unit score is that side's mean (a unit is never
 *   penalised for a missing evidence kind); when neither side has scored
 *   items the unit scores 0.
 * - Unit status thresholds: Competent >= 75, Partially 50-74, Not Yet < 50.
 *   The status is derived from the ROUNDED unit score so the displayed score
 *   and badge always agree.
 * - overallScore = Math.round(mean of the per-unit rounded scores) across
 *   ALL pack competency units; units with no items score 0 (unassessed =
 *   Not Yet Competent).
 * - nsqfLevelRecommended = overallScore >= 50 ? pack.nsqfLevel
 *   : max(1, pack.nsqfLevel - 1): a worker below 50 overall cannot be
 *   recommended at the pack's full level and drops one level (floor 1).
 *
 * NOTE: AssessmentItem carries no workerId, so `workerId` is stamped as ''
 * here; server callers MUST overwrite it with the authenticated worker id
 * before persisting or returning the profile.
 */
export function generateCompetencyProfile(
  assessmentItems: AssessmentItem[],
  pack: NSQFQualificationPack,
): CompetencyProfile {
  const byUnit = new Map<string, AssessmentItem[]>();
  for (const item of assessmentItems) {
    if (!item || typeof item.unitId !== 'string') continue;
    const list = byUnit.get(item.unitId) ?? [];
    list.push(item);
    byUnit.set(item.unitId, list);
  }

  const unitScores: NonNullable<CompetencyProfile['unitScores']> = {};
  const topLevelGaps: string[] = [];

  for (const unit of pack.competencyUnits) {
    const items = byUnit.get(unit.id) ?? [];

    const performanceValues: number[] = [];
    for (const item of items) {
      if (item.kind !== 'performance') continue;
      if (typeof item.rubricScore !== 'number') continue;
      if (!Number.isInteger(item.rubricScore) || item.rubricScore < 1 || item.rubricScore > 4) continue;
      performanceValues.push(((item.rubricScore - 1) / 3) * 100);
    }

    const knowledgeValues: number[] = [];
    const unitGaps: string[] = [];
    for (const item of items) {
      if (item.kind !== 'knowledge') continue;
      if (typeof item.knowledgePass !== 'boolean') continue;
      knowledgeValues.push(item.knowledgePass ? 100 : 0);
      if (item.knowledgePass === false) unitGaps.push(item.criterionText);
    }

    const performanceMean = mean(performanceValues);
    const knowledgeMean = mean(knowledgeValues);
    let raw: number;
    if (performanceMean !== null && knowledgeMean !== null) {
      raw = (performanceMean + knowledgeMean) / 2;
    } else if (performanceMean !== null) {
      raw = performanceMean;
    } else if (knowledgeMean !== null) {
      raw = knowledgeMean;
    } else {
      raw = 0;
    }

    const score = Math.round(raw);
    unitScores[unit.id] = {
      score,
      status: statusForScore(score),
      unitName: unit.name,
      knowledgeGaps: unitGaps,
    };
    topLevelGaps.push(...unitGaps);
  }

  const unitScoreValues = Object.values(unitScores).map((u) => u.score);
  const overallScore = unitScoreValues.length > 0 ? Math.round(mean(unitScoreValues) ?? 0) : 0;

  return {
    workerId: '',
    packId: pack.id,
    overallScore,
    unitScores,
    knowledgeGaps: topLevelGaps,
    nsqfLevelRecommended: overallScore >= 50 ? pack.nsqfLevel : Math.max(1, pack.nsqfLevel - 1),
    generatedAt: Date.now(),
  };
}

/**
 * Build an ADVISORY certification recommendation from a profile.
 *
 * Thresholds: overall >= 75 -> recommend_certification (requiredGapTraining
 * []); 50-74 -> recommend_gap_training (requiredGapTraining = names of units
 * whose status is not Competent); < 50 -> recommend_reassessment
 * (requiredGapTraining [] — no gap plan is prescribed, the worker is routed
 * back for full reassessment).
 *
 * The rationale cites the numeric scores plus the assessor notes verbatim.
 * `requiresHumanSignoff` is ALWAYS true: this draft never approves anyone by
 * itself; only an executive POST to /api/rpl/certify (which recomputes the
 * profile server-side and records executiveUid + signedAt) creates a stored
 * certification. That split is the never-auto-approve enforcement.
 */
export function generateCertificationRecommendation(
  profile: CompetencyProfile,
  assessorNotes: string,
): DraftCertificationRecommendation {
  const overall = typeof profile.overallScore === 'number' ? profile.overallScore : 0;
  const entries = Object.entries(profile.unitScores ?? {});
  const competentCount = entries.filter(([, u]) => u.status === 'competent').length;
  const partialCount = entries.filter(([, u]) => u.status === 'partial').length;
  const notYetCount = entries.filter(([, u]) => u.status === 'not_yet').length;

  let status: RPLCertificationRecommendation['status'];
  let requiredGapTraining: string[];
  if (overall >= 75) {
    status = 'recommend_certification';
    requiredGapTraining = [];
  } else if (overall >= 50) {
    status = 'recommend_gap_training';
    requiredGapTraining = entries
      .filter(([, u]) => u.status !== 'competent')
      .map(([unitId, u]) => u.unitName ?? unitId);
  } else {
    status = 'recommend_reassessment';
    requiredGapTraining = [];
  }

  const notes = assessorNotes.trim();
  const rationale =
    `Overall competency ${overall}/100 across ${entries.length} unit(s): ` +
    `${competentCount} Competent, ${partialCount} Partially Competent, ${notYetCount} Not Yet Competent. ` +
    `Assessor notes: ${notes ? notes : 'none provided.'} ` +
    `This recommendation is advisory only and requires executive sign-off before any certification.`;

  return {
    workerId: profile.workerId,
    recommendedLevel: profile.nsqfLevelRecommended,
    status,
    rationale,
    requiredGapTraining,
    requiresHumanSignoff: true,
  };
}
