// SIH-26242 RPL track — shared score computation + stored-score reading.
//
// This module is the SINGLE source of truth for how rubric items become
// numbers. It deliberately has only type-only imports so it can be loaded
// both by Next.js routes (extensionless resolution) and by plain-Node
// scripts via type-stripping (scripts import the .ts file directly —
// see scripts/rpl/seed-rpl-demo.mjs, scripts/rpl/backfill-assessment-scores.mjs).
// generateCompetencyProfile (./competency-profile) now delegates its unit
// math to scoreItemsAgainstUnits below, so the profile shown on the worker
// profile / certification path and the score written at assessment-save
// time can never diverge.
//
// Canonical scale: 0-100 (same contract as CompetencyProfile.overallScore).
// Raw rubric values (1-4) survive only in the `scores` map, which exists
// for debuggability + the legacy admin fallback and is never treated as 0-100.

import type { AssessmentItem, CompetencyProfile, UnitMastery } from './types';
import type { NSQFCompetencyUnit, NSQFQualificationPack } from './nsqf-packs';

export type UnitScores = NonNullable<CompetencyProfile['unitScores']>;

export interface ScoredUnits {
  unitScores: UnitScores;
  /** Math.round(mean of the per-unit rounded scores), 0-100. */
  overallScore: number;
  knowledgeGaps: string[];
}

export interface AssessmentScoreFields {
  /** 0-100, identical to CompetencyProfile.overallScore for the same items. */
  overallScore: number;
  unitScores: UnitScores;
  /** Raw per-item values keyed by itemId: performance rubric 1-4, knowledge 0/1. */
  scores: Record<string, number>;
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
 * Score items against a unit list.
 *
 * Formulas (documented contract, previously in generateCompetencyProfile):
 * - Performance item = ((rubricScore - 1) / 3) * 100, so rubric 1 -> 0,
 *   2 -> 33.3, 3 -> 66.7, 4 -> 100. Unscored items are skipped, not zeroed.
 * - Knowledge item = knowledgePass ? 100 : 0. Unanswered items are skipped.
 * - Unit score = (performanceMean + knowledgeMean) / 2 when both sides have
 *   scored items, else whichever side exists, else 0. Each unit is rounded
 *   once (Math.round) before aggregation.
 * - Unit status: Competent >= 75, Partial 50-74, Not Yet < 50 (from the
 *   ROUNDED unit score so badge and number always agree).
 * - overallScore = Math.round(mean of the per-unit rounded scores) across
 *   ALL given units; units with no scored items count as 0.
 */
export function scoreItemsAgainstUnits(
  units: NSQFCompetencyUnit[],
  assessmentItems: AssessmentItem[],
): ScoredUnits {
  const byUnit = new Map<string, AssessmentItem[]>();
  for (const item of assessmentItems) {
    if (!item || typeof item.unitId !== 'string') continue;
    const list = byUnit.get(item.unitId) ?? [];
    list.push(item);
    byUnit.set(item.unitId, list);
  }

  const unitScores: UnitScores = {};
  const knowledgeGaps: string[] = [];

  for (const unit of units) {
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
    knowledgeGaps.push(...unitGaps);
  }

  const unitScoreValues = Object.values(unitScores).map((u) => u.score);
  const overallScore = unitScoreValues.length > 0 ? Math.round(mean(unitScoreValues) ?? 0) : 0;

  return { unitScores, overallScore, knowledgeGaps };
}

/**
 * Compute the score fields an assessment document must carry so the admin
 * overview (and anything else reading the doc) sees real numbers instead of
 * the pre-fix always-0 fallback. Same formula as the competency profile.
 */
export function computeAssessmentScores(
  assessmentItems: AssessmentItem[],
  pack: NSQFQualificationPack,
): AssessmentScoreFields {
  const { unitScores, overallScore } = scoreItemsAgainstUnits(pack.competencyUnits, assessmentItems);

  const scores: Record<string, number> = {};
  for (const item of assessmentItems) {
    if (!item || typeof item.itemId !== 'string' || !item.itemId) continue;
    if (item.kind === 'performance' && isRubricScore(item.rubricScore)) {
      scores[item.itemId] = item.rubricScore;
    } else if (item.kind === 'knowledge' && typeof item.knowledgePass === 'boolean') {
      scores[item.itemId] = item.knowledgePass ? 1 : 0;
    }
  }

  return { overallScore, unitScores, scores };
}

function isRubricScore(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4;
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/**
 * Read-side twin of the write path: extract a 0-100 score from a stored
 * rpl_assessments doc. Fallback chain (deliberate, matches the historical
 * admin-overview definition):
 *   1. numeric `overallScore`;
 *   2. mean of `unitScores` entries (number or `{ score: number }`);
 *   3. mean of the raw `scores` map values (legacy seeder shape, rubric 1-4
 *      or knowledge 0/1 — this legacy fallback is NOT 0-100 scaled; docs
 *      written since the shared-lib fix always carry `overallScore`, and
 *      scripts/rpl/backfill-assessment-scores.mjs normalises older docs);
 *   null when nothing usable is stored (caller decides how to display).
 */
export function storedAssessmentScore(data: Record<string, unknown>): number | null {
  const overall = finiteNumber(data.overallScore);
  if (overall !== null) return overall;

  const unitEntries = Object.values(asRecord(data.unitScores));
  if (unitEntries.length > 0) {
    const vals: number[] = [];
    for (const entry of unitEntries) {
      if (typeof entry === 'number' && Number.isFinite(entry)) {
        vals.push(entry);
      } else {
        const s = finiteNumber(asRecord(entry).score);
        if (s !== null) vals.push(s);
      }
    }
    const m = mean(vals);
    if (m !== null) return m;
  }

  const scoreVals = Object.values(asRecord(data.scores)).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  return mean(scoreVals);
}
