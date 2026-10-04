import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { NSQF_PACKS } from '@/lib/rpl/nsqf-packs';
import { checkKappaThresholds } from '@/lib/rpl/kappa-monitor';
import type { KappaAlert } from '@/lib/rpl/types';

export const runtime = 'nodejs';

// GET /api/rpl/alerts — executive only.
// Runs checkKappaThresholds for every NSQF pack, returns { alerts } newest-first.
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // INLINE rate-limit config (do not touch Limits).
    const rl = await enforceRateLimit(`rpl:alerts:${auth.uid}`, {
      maxRequests: 30,
      windowMs: 60000,
      message: 'Too many requests. Please slow down.',
    });
    if (rl) return rl;

    const all: KappaAlert[] = [];
    await Promise.all(
      NSQF_PACKS.map(async (pack) => {
        try {
          const alerts = await checkKappaThresholds(pack.id);
          all.push(...alerts);
        } catch (err) {
          console.warn(
            `[RPL Alerts] check failed for pack ${pack.id}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }),
    );

    all.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return NextResponse.json({ alerts: all });
  } catch (err) {
    console.error('[RPL Alerts GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
