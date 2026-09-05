import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  AI_JOB_QUEUED,
  AI_JOB_RUNNING,
  AI_JOB_DONE,
  AI_JOB_FAILED,
  AI_JOB_CANCELLED,
  FORGE_LEASE_MS,
  FORGE_LEASE_STALE_MS,
  FORGE_JOB_TTL_MS,
  FORGE_CACHE_TTL_MS,
  FORGE_PAYLOAD_TEXT_PART,
} from '@/lib/constants';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Admin-SDK data layer for the async AI-forge job pipeline (Phase 115C).
 *
 * All writes go through the Admin SDK and therefore bypass Firestore security
 * rules; the rules lock `ai_jobs` and `forge_cache` completely so clients can
 * never read or write job state directly. Clients observe progress only
 * through the `runForgeTick` / `createForgeJob` server actions.
 *
 * Layout:
 *   ai_jobs/{jobId}                → job state (status, cursor, lease, progress)
 *   ai_jobs/{jobId}/payload/text_0..N → combined text split into ≤200k parts
 *   ai_jobs/{jobId}/payload/img_0..N  → one image data-URI per document
 *   forge_cache/{contentHash}      → completed question blobs (TTL 30 days)
 *
 * Each payload document stays far below Firestore's 1 MiB document ceiling;
 * the whole payload (up to 24 images + 500k chars of text) would exceed it,
 * which is why it is split per image / per text part.
 */

export interface ForgeDocumentInput {
  name?: string;
  kind: 'pdf' | 'docx' | 'txt' | 'md' | 'image';
  text?: string;
  imageDataUris?: string[];
}

export interface ForgeJobCursor {
  chunkIndex: number;
  modelIndex: number;
  ticks: number;
}

export interface ForgeJobDoc {
  id: string;
  userId: string;
  userRole: string;
  difficulty: 'easy' | 'moderate' | 'hard';
  questionCount: number;
  fileCount: number;
  fileTypes: string[];
  status: string;
  cursor: ForgeJobCursor;
  generatedCount: number;
  progressNote: string;
  engine: string | null;
  error: string | null;
  consecutiveFailures: number;
  nextAttemptAt: number;
  lastTickAt: number | null;
  workerToken: string;
  contentHash: string;
  createdAt: number;
  updatedAt: number;
  leaseBy: string | null;
  leaseExpiresAt: number;
  expiresAt: number;
  /** Accumulated generated questions (grows each successful tick). */
  questions?: unknown[];
}

export interface PayloadParts {
  text: string;
  imageDataUris: string[];
}

export type ClaimResult =
  | { outcome: 'not_found' }
  | { outcome: 'terminal'; job: ForgeJobDoc }
  | { outcome: 'busy'; job: ForgeJobDoc; retryAfterMs: number }
  | { outcome: 'claimed'; job: ForgeJobDoc };

const TERMINAL_STATUSES: string[] = [AI_JOB_DONE, AI_JOB_FAILED, AI_JOB_CANCELLED];

export function contentHashOf(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function generateWorkerToken(): string {
  return randomBytes(24).toString('hex');
}

export function safeTokenEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function toJobDoc(id: string, data: FirebaseFirestore.DocumentData): ForgeJobDoc {
  return { id, ...data } as ForgeJobDoc;
}

async function updateJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  const update: Record<string, unknown> = { ...patch, updatedAt: Date.now() };
  delete update.id;
  await getAdminDb().collection(COLLECTIONS.AI_JOBS).doc(jobId).update(update);
}

export const forgeJobService = {
  async createJob(input: {
    userId: string;
    userRole: string;
    difficulty: 'easy' | 'moderate' | 'hard';
    questionCount: number;
    documents: ForgeDocumentInput[];
    contentHash: string;
  }): Promise<ForgeJobDoc> {
    const db = getAdminDb();
    const now = Date.now();
    const jobRef = db.collection(COLLECTIONS.AI_JOBS).doc();
    const batch = db.batch();

    const texts: string[] = [];
    const imageDataUris: string[] = [];
    const fileTypes: string[] = [];
    for (const d of input.documents) {
      fileTypes.push(d.kind);
      if (d.text) texts.push(d.text);
      for (const img of d.imageDataUris || []) imageDataUris.push(img);
    }

    imageDataUris.forEach((uri, i) => {
      batch.set(jobRef.collection('payload').doc(`img_${i}`), {
        kind: 'image',
        index: i,
        imageDataUri: uri,
      });
    });

    const combinedText = texts.join('\n\n---\n\n');
    if (combinedText.length > 0) {
      const parts = Math.ceil(combinedText.length / FORGE_PAYLOAD_TEXT_PART);
      for (let i = 0; i < parts; i++) {
        batch.set(jobRef.collection('payload').doc(`text_${i}`), {
          kind: 'text',
          index: i,
          text: combinedText.slice(i * FORGE_PAYLOAD_TEXT_PART, (i + 1) * FORGE_PAYLOAD_TEXT_PART),
        });
      }
    }

    const jobDoc: ForgeJobDoc = {
      id: jobRef.id,
      userId: input.userId,
      userRole: input.userRole,
      difficulty: input.difficulty,
      questionCount: input.questionCount,
      fileCount: input.documents.length,
      fileTypes,
      status: AI_JOB_QUEUED,
      cursor: { chunkIndex: 0, modelIndex: 0, ticks: 0 },
      generatedCount: 0,
      progressNote: 'Job queued',
      engine: null,
      error: null,
      consecutiveFailures: 0,
      nextAttemptAt: 0,
      lastTickAt: null,
      workerToken: generateWorkerToken(),
      contentHash: input.contentHash,
      createdAt: now,
      updatedAt: now,
      leaseBy: null,
      leaseExpiresAt: 0,
      expiresAt: now + FORGE_JOB_TTL_MS,
    };
    batch.set(jobRef, jobDoc);
    await batch.commit();
    return jobDoc;
  },

  async getJob(jobId: string): Promise<ForgeJobDoc | null> {
    const snap = await getAdminDb().collection(COLLECTIONS.AI_JOBS).doc(jobId).get();
    if (!snap.exists) return null;
    return toJobDoc(snap.id, snap.data()!);
  },

  /**
   * Claim the job for a single tick (one Gemini call). Atomic transaction
   * gives a single-writer guarantee: while a foreign lease is fresh the job is
   * "busy" and returns retryAfterMs; crashed workers' leases are reclaimed
   * after they expire.
   */
  async claimNextTick(jobId: string, workerId: string, now: number): Promise<ClaimResult> {
    const db = getAdminDb();
    const ref = db.collection(COLLECTIONS.AI_JOBS).doc(jobId);

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { outcome: 'not_found' } as ClaimResult;

      const job = toJobDoc(snap.id, snap.data()!);

      if (TERMINAL_STATUSES.includes(job.status)) {
        return { outcome: 'terminal', job };
      }

      // Backoff gate: even a queued job whose nextAttemptAt is in the future is
      // "busy" so a churning client cannot hammer Gemini during cooldown.
      if (typeof job.nextAttemptAt === 'number' && job.nextAttemptAt > now) {
        return { outcome: 'busy', job, retryAfterMs: Math.max(500, job.nextAttemptAt - now) };
      }

      const leaseActive =
        typeof job.leaseExpiresAt === 'number' && job.leaseExpiresAt > now && job.leaseBy !== workerId;
      if (leaseActive) {
        return { outcome: 'busy', job, retryAfterMs: Math.max(500, job.leaseExpiresAt - now) };
      }

      tx.update(ref, {
        status: AI_JOB_RUNNING,
        leaseBy: workerId,
        leaseExpiresAt: now + FORGE_LEASE_MS,
        updatedAt: now,
      });

      job.status = AI_JOB_RUNNING;
      job.leaseBy = workerId;
      job.leaseExpiresAt = now + FORGE_LEASE_MS;
      job.updatedAt = now;
      return { outcome: 'claimed', job };
    });
  },

  async appendQuestions(jobId: string, opts: {
    questions: unknown[];
    engine: string;
    cursor: ForgeJobCursor;
    generatedCount: number;
    questionCount: number;
    final: boolean;
  }): Promise<void> {
    await updateJob(jobId, {
      status: opts.final ? AI_JOB_DONE : AI_JOB_QUEUED,
      questions: FieldValue.arrayUnion(...opts.questions),
      engine: opts.engine,
      cursor: opts.cursor,
      generatedCount: opts.generatedCount,
      consecutiveFailures: 0,
      nextAttemptAt: 0,
      error: null,
      progressNote: opts.final
        ? 'Generation complete'
        : `${opts.generatedCount}/${opts.questionCount} questions generated`,
      leaseBy: null,
      leaseExpiresAt: 0,
    });
  },

  async markTickFailed(jobId: string, opts: {
    error: string;
    final: boolean;
    cursor: ForgeJobCursor;
    progressNote: string;
    nextAttemptAt: number;
  }): Promise<void> {
    await updateJob(jobId, {
      status: opts.final ? AI_JOB_FAILED : AI_JOB_QUEUED,
      error: opts.error,
      cursor: opts.cursor,
      progressNote: opts.progressNote,
      nextAttemptAt: opts.nextAttemptAt,
      leaseBy: null,
      leaseExpiresAt: 0,
    });
  },

  async loadPayload(jobId: string): Promise<PayloadParts> {
    const snap = await getAdminDb()
      .collection(COLLECTIONS.AI_JOBS)
      .doc(jobId)
      .collection('payload')
      .get();
    const textParts: string[] = [];
    const imageDataUris: string[] = [];
    for (const doc of snap.docs) {
      const data = doc.data() as { kind?: string; index?: number; text?: string; imageDataUri?: string };
      if (data.kind === 'text' && typeof data.text === 'string') {
        textParts[data.index ?? textParts.length] = data.text;
      } else if (data.kind === 'image' && typeof data.imageDataUri === 'string') {
        imageDataUris[data.index ?? imageDataUris.length] = data.imageDataUri;
      }
    }
    return { text: textParts.join(''), imageDataUris };
  },

  async readCache(contentHash: string): Promise<{ questions: unknown[]; engine: string | null } | null> {
    const snap = await getAdminDb().collection(COLLECTIONS.FORGE_CACHE).doc(contentHash).get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (!Array.isArray(data?.questions) || (typeof data.expiresAt === 'number' && data.expiresAt < Date.now())) {
      return null;
    }
    return { questions: data.questions, engine: typeof data.engine === 'string' ? data.engine : null };
  },

  async writeCache(contentHash: string, questions: unknown[], engine: string): Promise<void> {
    await getAdminDb().collection(COLLECTIONS.FORGE_CACHE).doc(contentHash).set({
      questions,
      engine,
      createdAt: Date.now(),
      expiresAt: Date.now() + FORGE_CACHE_TTL_MS,
    });
  },

  async listRunnableJobs(max: number): Promise<ForgeJobDoc[]> {
    const now = Date.now();
    const snap = await getAdminDb()
      .collection(COLLECTIONS.AI_JOBS)
      .where('status', 'in', [AI_JOB_QUEUED, AI_JOB_RUNNING])
      .limit(max * 4)
      .get();
    const jobs: ForgeJobDoc[] = [];
    for (const doc of snap.docs) {
      const job = toJobDoc(doc.id, doc.data());
      const ready =
        (job.status === AI_JOB_QUEUED && (job.nextAttemptAt ?? 0) <= now) ||
        (job.status === AI_JOB_RUNNING && (job.leaseExpiresAt ?? 0) < now - FORGE_LEASE_STALE_MS);
      if (ready) jobs.push(job);
      if (jobs.length >= max) break;
    }
    return jobs;
  },

  async cleanupExpired(): Promise<number> {
    const db = getAdminDb();
    const now = Date.now();
    const jobs = await db.collection(COLLECTIONS.AI_JOBS).where('expiresAt', '<', now).limit(15).get();
    let removed = 0;
    for (const doc of jobs.docs) {
      try {
        await db.recursiveDelete(doc.ref);
        removed++;
      } catch (err) {
        console.warn(`[Forge] cleanup failed for ${doc.id}:`, err);
      }
    }
    const caches = await db.collection(COLLECTIONS.FORGE_CACHE).where('expiresAt', '<', now).limit(50).get();
    for (const doc of caches.docs) {
      try {
        await db.recursiveDelete(doc.ref);
      } catch (err) {
        console.warn(`[Forge] cache cleanup failed for ${doc.id}:`, err);
      }
    }
    return removed;
  },
};