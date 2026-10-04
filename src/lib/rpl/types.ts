// SIH-26242 RPL track — shared TypeScript types for the entire build.
// Additive-only file. Extended by later prompts via optional fields only;
// existing interface names and required fields are stable.

import type { NSQFCompetencyUnit } from './nsqf-packs';

// ---------------------------------------------------------------------------
// Worker + self-declaration
// ---------------------------------------------------------------------------

export interface WorkerProfile {
  uid: string;
  name?: string;
  trade?: string;
  sector?: string;
  yearsExperience?: number;
  location?: string;
  employerType?: 'informal' | 'formal' | 'self-employed' | string;
  declarationSubmittedAt?: number;
  assessmentReferenceCode?: string;
  status?: string;
}

export type DeclarationMark = 'can-do' | 'done' | 'never';

export interface SelfDeclaration {
  workerId: string;
  trade?: string;
  sector?: string;
  yearsExperience?: number;
  location?: string;
  employerType?: string;
  declarationText?: string;
  declarationsByPack?: Record<string, { unitId: string; status: DeclarationMark }[]>;
  evidenceTextByPack?: Record<string, string>;
  matchedPacks?: string[];
}

/** Self-declaration queued in IndexedDB while offline. */
export interface PendingDeclaration extends SelfDeclaration {
  localId: string;
  savedAt: number;
}

// ---------------------------------------------------------------------------
// Assessment (assessor scoring)
// ---------------------------------------------------------------------------

export type AssessmentItemKind = 'performance' | 'knowledge';

/** One scored criterion — lives in rpl_assessments/{id}/items/{itemId}. */
export interface AssessmentItem {
  itemId: string;
  assessmentId: string;
  unitId: string;
  unitName?: string;
  kind: AssessmentItemKind;
  criterionText: string;
  /** 1=Not demonstrated, 2=Partially, 3=With prompting, 4=Independently */
  rubricScore?: 1 | 2 | 3 | 4;
  /** Max 200 chars, assessor note */
  note?: string;
  knowledgePass?: boolean;
  aiProposedScore?: number;
  aiAccepted?: boolean;
  scoredBy?: string;
  scoredAt?: number;
}

export interface AssessorScore {
  assessorId: string;
  workerId: string;
  assessmentId: string;
  packId: string;
  scores?: Record<string, number>;
  knowledgeScores?: Record<string, boolean>;
  notes?: string;
}

export type RPLAssessmentStatus = 'draft' | 'submitted';

/** rpl_assessments/{assessmentId} — items live in the items subcollection. */
export interface RPLAssessmentDoc extends AssessorScore {
  status: RPLAssessmentStatus;
  /** True when the assessor accepted >=1 AI-proposed score. Drives kappa baseline split. */
  aiSuggestionUsed: boolean;
  /** True for forge-generated template packs; excluded from assessor queues. */
  isTemplate?: boolean;
  createdAt: number;
  submittedAt?: number;
  workerName?: string;
  referenceCode?: string;
}

// ---------------------------------------------------------------------------
// Firestore document shapes (rpl_* collections)
// ---------------------------------------------------------------------------

/** rpl_workers/{workerId} */
export interface RPLWorkerDoc extends WorkerProfile {
  declaration?: SelfDeclaration;
  createdAt: number;
  updatedAt: number;
}

/** rpl_consistency/{packId} */
export interface RPLConsistencyDoc extends InterAssessorAgreement {
  assessorPairs?: { assessorA: string; assessorB: string; kappa: number }[];
  perCriterion?: { criterionId: string; kappa: number }[];
  unassistedKappa?: number;
  assistedKappa?: number;
  assessmentCount?: number;
}

/** rpl_certifications/{workerId} */
export interface RPLCertificationDoc extends RPLCertificationRecommendation {
  executiveUid: string;
  signedAt: number;
  assessorNotes?: string;
}

// ---------------------------------------------------------------------------
// Competency profile + certification
// ---------------------------------------------------------------------------

export type UnitMastery = 'competent' | 'partial' | 'not_yet';

export interface CompetencyProfile {
  workerId: string;
  packId: string;
  overallScore?: number;
  unitScores?: Record<
    string,
    { score: number; status: UnitMastery; unitName?: string; knowledgeGaps?: string[] }
  >;
  knowledgeGaps?: string[];
  nsqfLevelRecommended?: number;
  generatedAt?: number;
}

export interface RPLCertificationRecommendation {
  workerId: string;
  recommendedLevel?: number;
  status:
    | 'recommend_certification'
    | 'recommend_gap_training'
    | 'recommend_reassessment'
    | 'pending_human_signoff';
  rationale?: string;
  requiredGapTraining?: string[];
}

// ---------------------------------------------------------------------------
// Inter-assessor agreement (kappa)
// ---------------------------------------------------------------------------

export type KappaInterpretation =
  | 'Poor'
  | 'Fair'
  | 'Moderate'
  | 'Substantial'
  | 'Almost perfect';

export interface InterAssessorAgreement {
  packId: string;
  kappa?: number;
  interpretation?: string;
  confidenceLower?: number;
  confidenceUpper?: number;
  computedAt?: number;
}

export interface ConsistencyReport {
  packId: string;
  overallKappa: number;
  interpretation: KappaInterpretation;
  confidence: [number, number];
  assessorPairs: { assessorA: string; assessorB: string; kappa: number }[];
  perCriterion: { criterionId: string; criterionText?: string; kappa: number }[];
  unassistedKappa: number | null;
  assistedKappa: number | null;
  assessmentCount: number;
  computedAt: number;
}

export interface KappaAlert {
  severity: 'warning' | 'critical';
  packId: string;
  assessorId?: string;
  message: string;
  recommendedAction: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Forge-generated assessment packs
// ---------------------------------------------------------------------------

export type AssessmentMethod = 'observation' | 'product evidence' | 'oral questioning';

export interface AssessmentPackItem {
  id: string;
  unitId: string;
  taskDescription: string;
  mapsToCriterion: string;
  difficulty: 1 | 2 | 3 | 4;
  assessmentMethod: AssessmentMethod;
}

export interface RPLAssessmentPack {
  packId: string;
  trade: string;
  units: NSQFCompetencyUnit[];
  items: AssessmentPackItem[];
  generatedAt: number;
}

// ---------------------------------------------------------------------------
// Matching (Gemini-assisted)
// ---------------------------------------------------------------------------

export interface RPLPackMatch {
  packTitle: string;
  matchReason: string;
  suggestedUnits: string[];
  assessmentQuestions: string[];
}

// ---------------------------------------------------------------------------
// Worker status + admin overview
// ---------------------------------------------------------------------------

export type RPLStage =
  | 'declared'
  | 'assessment_scheduled'
  | 'assessed'
  | 'profile_ready'
  | 'certified';

export interface MatchedPackSummary {
  packId: string;
  title: string;
  nsqfLevel: number;
  matchedUnits: string[];
  practiceQuestions?: string[];
}

export interface StatusResponse {
  workerId: string;
  stage: RPLStage;
  referenceCode: string;
  matchedPacks: MatchedPackSummary[];
  assessorAssigned?: string;
  assessmentScheduledAt?: number;
  profileReady?: boolean;
  certified?: boolean;
  declarationSubmittedAt?: number;
}

export interface PackPerformanceRow {
  packId: string;
  title: string;
  nsqfLevel: number;
  workersAssessed: number;
  avgScore: number;
  kappa: number | null;
  interpretation: string;
}

export interface ActivityEvent {
  type: 'declaration' | 'assessment' | 'certification' | 'kappa-alert';
  message: string;
  at: number;
  ref?: string;
}

export interface AssessorLeaderboardRow {
  assessorId: string;
  assessments: number;
  avgAgreement: number | null;
  trend: 'improving' | 'declining' | 'stable';
}

export interface AdminOverview {
  totalWorkers: number;
  assessmentsInProgress: number;
  assessmentsCompleted: number;
  averageKappa: number | null;
  certificationsThisMonth: number;
  packs: PackPerformanceRow[];
  recentActivity: ActivityEvent[];
  assessors: AssessorLeaderboardRow[];
  activeAlerts: KappaAlert[];
}

// ---------------------------------------------------------------------------
// Evidence (image data-URLs in Firestore; Storage rule is future-proofing)
// ---------------------------------------------------------------------------

export interface EvidenceImageDoc {
  imageId: string;
  assessmentId: string;
  workerId: string;
  unitId: string;
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: number;
}
