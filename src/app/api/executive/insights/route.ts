import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { AiLogEntry } from '@/services/ai-log.service';

export const runtime = 'nodejs';

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    const [aiSnap, securitySnap] = await Promise.all([
      getAdminDb().collection(COLLECTIONS.AI_LOGS).orderBy('createdAt', 'desc').select('createdAt', 'success', 'durationMs', 'questionCount', 'model').limit(1000).get(),
      getAdminDb().collection(COLLECTIONS.SECURITY_LOGS).orderBy('createdAt', 'desc').select('createdAt', 'event').limit(1000).get(),
    ]);

    // --- AI insights (last 30 days) ---
    const aiLogs: Array<Pick<AiLogEntry, 'success' | 'durationMs' | 'questionCount' | 'model'> & { createdAt: number }> = aiSnap.docs
      .map(d => {
        const data = d.data();
        return {
          success: data.success === true,
          durationMs: typeof data.durationMs === 'number' ? data.durationMs : 0,
          questionCount: typeof data.questionCount === 'number' ? data.questionCount : 0,
          model: typeof data.model === 'string' ? data.model : 'unknown',
          createdAt: data.createdAt?.toMillis?.() ?? (typeof data.createdAt === 'number' ? data.createdAt : 0),
        };
      })
      .filter(l => l.createdAt >= cutoff);

    const aiTotal = aiLogs.length;
    const aiSuccess = aiLogs.filter(l => l.success).length;
    const aiFailures = aiTotal - aiSuccess;
    const aiAvgDurationMs = aiTotal > 0
      ? Math.round(aiLogs.reduce((sum, l) => sum + (l.durationMs || 0), 0) / aiTotal)
      : 0;
    const aiTotalQuestions = aiLogs.reduce((sum, l) => sum + (l.questionCount || 0), 0);

    const perModel: Record<string, { total: number; success: number }> = {};
    aiLogs.forEach(l => {
      const model = l.model || 'unknown';
      if (!perModel[model]) perModel[model] = { total: 0, success: 0 };
      perModel[model].total++;
      if (l.success) perModel[model].success++;
    });
    const modelBreakdown = Object.entries(perModel)
      .map(([model, v]) => ({ model, total: v.total, success: v.success, successRate: v.total > 0 ? Math.round((v.success / v.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);

    const dailyActivity: Record<string, { generated: number; failed: number }> = {};
    aiLogs.forEach(l => {
      const day = new Date(l.createdAt || 0).toISOString().split('T')[0];
      if (!dailyActivity[day]) dailyActivity[day] = { generated: 0, failed: 0 };
      dailyActivity[day].generated++;
      if (!l.success) dailyActivity[day].failed++;
    });

    // --- Security insights (last 30 days) ---
    const securityLogs: Array<{ event: string; timestamp: number }> = securitySnap.docs
      .map(d => {
        const data = d.data();
        return {
          event: typeof data.event === 'string' ? data.event : 'unknown',
          timestamp: data.createdAt?.toMillis?.() ?? (typeof data.timestamp === 'number' ? data.timestamp : 0),
        };
      })
      .filter(l => l.timestamp >= cutoff);

    const perEvent: Record<string, number> = {};
    securityLogs.forEach(l => {
      const event = l.event || 'unknown';
      perEvent[event] = (perEvent[event] || 0) + 1;
    });
    const eventBreakdown = Object.entries(perEvent)
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count);

    const violationCount = securityLogs.filter(l => l.event === 'security_violation').length;
    const authFailureCount = securityLogs.filter(l => l.event === 'invalid_token' || l.event === 'login_failed' || l.event === 'unauthorized_access').length;
    const suspiciousCount = securityLogs.filter(l => l.event === 'suspicious_reconnect' || l.event === 'duplicate_session' || l.event === 'session_replaced').length;
    const rateLimitedCount = securityLogs.filter(l => l.event === 'rate_limited').length;

    return NextResponse.json({
      ai: {
        total: aiTotal,
        success: aiSuccess,
        failures: aiFailures,
        successRate: aiTotal > 0 ? Math.round((aiSuccess / aiTotal) * 100) : 0,
        avgDurationMs: aiAvgDurationMs,
        totalQuestionsGenerated: aiTotalQuestions,
        modelBreakdown,
        dailyActivity: Object.entries(dailyActivity)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({ date, ...v })),
      },
      security: {
        total: securityLogs.length,
        violations: violationCount,
        authFailures: authFailureCount,
        suspicious: suspiciousCount,
        rateLimited: rateLimitedCount,
        eventBreakdown,
      },
      windowDays: 30,
    });
  } catch (err: any) {
    console.error('[Insights] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
