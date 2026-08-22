import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { aiLogService } from '@/services/ai-log.service';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const _rl = enforceRateLimit(`executive:ai-logs:${auth.uid}`, Limits.READ_PER_USER);
    if (_rl) return _rl;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const userId = searchParams.get('userId') || undefined;
    const successParam = searchParams.get('success');
    const cursor = searchParams.get('cursor') || undefined;

    const { logs, nextCursor, hasMore } = await aiLogService.getAll({
      limit,
      userId,
      success: successParam !== null ? successParam === 'true' : undefined,
      cursor,
    });

    return NextResponse.json({ logs, nextCursor, hasMore });
  } catch (err: any) {
    console.error('[AiLogs GET] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}