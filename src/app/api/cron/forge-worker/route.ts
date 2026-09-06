import { NextRequest, NextResponse } from 'next/server';
import { forgeJobService } from '@/services/forge-job.service';
import { runForgeTick } from '@/ai/flows/generate-quiz-pdf-flow';

export const runtime = 'nodejs';

// Phase 115C cron backstop for the async AI-forge job pipeline.
//
// The client drives runForgeTick in a loop while the tab is open; this worker
// is the safety net that keeps queued jobs progressing even after the tab
// closes (Vercel cron can also hit server actions directly). The same
// CRON_SECRET guard as sweep-battles prevents unauthenticated invocation.
//
// Bounded batch: each tick makes one Gemini call of up to GEMINI_TIMEOUT_MS
// (35s), so we stop early once the run has been active for 30s to stay well
// inside Vercel's 60s maxDuration ceiling — remaining jobs wait for the next
// scheduled run (hourly GitHub Actions backstop, daily Vercel cron).
const MAX_PER_RUN = 6;
const RUN_WINDOW_MS = 30000;
// Orphaned-lease threshold: a job stuck in processing/running with a lease
// older than this is flagged (read-only) and surfaced to executives.
const ORPHANED_LEASE_MS = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  let processed = 0;
  const finished: string[] = [];
  const errors: string[] = [];

  try {
    await forgeJobService.cleanupExpired();
  } catch (err) {
    errors.push(`cleanup: ${err instanceof Error ? err.message : String(err)}`);
  }

  const jobs = await forgeJobService.listRunnableJobs(MAX_PER_RUN);
  for (const job of jobs) {
    if (Date.now() - startedAt > RUN_WINDOW_MS) break;
    try {
      const res = await runForgeTick({ jobId: job.id, workerToken: job.workerToken });
      processed++;
      if (res.status === 'done' || res.status === 'failed') finished.push(job.id);
    } catch (err) {
      errors.push(`${job.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Orphaned-lease telemetry (read-only, never mutates jobs).
  let orphaned: string[] = [];
  try {
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const { COLLECTIONS } = await import('@/lib/constants');
    const snap = await getAdminDb()
      .collection(COLLECTIONS.AI_JOBS)
      .where('status', 'in', ['processing', 'running'])
      .limit(20)
      .get();
    const now = Date.now();
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const lease = typeof data.leaseExpiresAt === 'number' ? (data.leaseExpiresAt as number) : 0;
      if (lease > 0 && now - lease > ORPHANED_LEASE_MS) orphaned.push(d.id);
    }
    if (orphaned.length > 0) {
      try {
        const { notificationService } = await import('@/services/notification.service');
        const execSnap = await getAdminDb()
          .collection(COLLECTIONS.USERS)
          .where('role', '==', 'executive')
          .limit(10)
          .get();
        for (const jobId of orphaned.slice(0, 5)) {
          for (const e of execSnap.docs) {
            await notificationService
              .create({
                type: 'system_warning',
                title: 'Orphaned Forge job detected',
                description: `Forge job ${jobId} has held its lease for over 1h and may need attention.`,
                createdAt: Date.now(),
                userId: e.id,
                link: '/executive/ai-logs',
                metadata: { jobId },
              } as never)
              .catch(() => {});
          }
        }
      } catch {
        // Telemetry must never fail the worker run.
      }
    }
  } catch (err) {
    errors.push(`orphaned-scan: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({ ok: true, processed, finished, errors, orphaned, orphanedJobIds: orphaned });
}