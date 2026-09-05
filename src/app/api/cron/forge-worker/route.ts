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
// scheduled run (every 5 minutes).
const MAX_PER_RUN = 6;
const RUN_WINDOW_MS = 30000;

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

  return NextResponse.json({ ok: true, processed, finished, errors });
}