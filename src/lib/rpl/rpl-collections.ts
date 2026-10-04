// SIH-26242 RPL track — canonical Firestore collection names + path builders.
// Additive-only file: no existing file imports or depends on legacy code paths.

export const RPL_WORKERS = 'rpl_workers';
export const RPL_ASSESSMENTS = 'rpl_assessments';
export const RPL_CONSISTENCY = 'rpl_consistency';
export const RPL_CERTIFICATIONS = 'rpl_certifications';
export const RPL_FORGE_CACHE = 'rpl_forge_cache';

export type {
  RPLWorkerDoc,
  RPLAssessmentDoc,
  AssessmentItem,
  RPLConsistencyDoc,
  RPLCertificationDoc,
  EvidenceImageDoc,
} from './types';

// ---------------------------------------------------------------------------
// Firestore document IDs cannot contain '/'. NSQF pack codes do (ELE/Q1301).
// Canonical pack codes live in the `packId` FIELD; document IDs use this
// sanitized form. Matches scripts/rpl/seed-rpl-demo.mjs + forge template IDs.
// ---------------------------------------------------------------------------
export function sanitizeRplDocId(raw: string): string {
  return raw.replace(/\//g, '_').slice(0, 200) || 'untitled';
}

// ---------------------------------------------------------------------------
// RECONCILIATION DECISION (do not deviate):
// Per-criterion scores live ONLY in the subcollection
// `rpl_assessments/{assessmentId}/items/{itemId}` (AssessmentItem docs).
// There is NO top-level rpl_scores collection.
// ---------------------------------------------------------------------------

export function rplWorkerPath(workerId: string): string {
  return `${RPL_WORKERS}/${workerId}`;
}

export function rplAssessmentPath(assessmentId: string): string {
  return `${RPL_ASSESSMENTS}/${assessmentId}`;
}

export function rplAssessmentItemsPath(assessmentId: string): string {
  return `${RPL_ASSESSMENTS}/${assessmentId}/items`;
}

export function rplConsistencyPath(packId: string): string {
  return `${RPL_CONSISTENCY}/${sanitizeRplDocId(packId)}`;
}

export function rplCertificationPath(workerId: string): string {
  return `${RPL_CERTIFICATIONS}/${workerId}`;
}

export function rplForgeCachePath(hash: string): string {
  return `${RPL_FORGE_CACHE}/${hash}`;
}

export function rplEvidencePath(assessmentId: string): string {
  return `${RPL_ASSESSMENTS}/${assessmentId}/evidence`;
}
