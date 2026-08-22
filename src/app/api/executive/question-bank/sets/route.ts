import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { fetchSetSummaries } from '@/lib/quiz-sets';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

const DEFAULT_PAGE_SIZE = 12;

function dateCutoff(range: string): number | null {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  switch (range) {
    case '7d': return now - 7 * day;
    case '30d': return now - 30 * day;
    case '90d': return now - 90 * day;
    case 'year': return now - 365 * day;
    default: return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const _rl = enforceRateLimit(`executive:sets:${auth.uid}`, Limits.READ_PER_USER);
    if (_rl) return _rl;

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim().toLowerCase();
    const category = (searchParams.get('category') || '').trim();
    const difficulty = (searchParams.get('difficulty') || '').trim();
    const source = (searchParams.get('source') || '').trim();
    const createdBy = (searchParams.get('createdBy') || '').trim().toLowerCase();
    const date = (searchParams.get('date') || '').trim();
    const minCount = parseInt(searchParams.get('minCount') || '', 10);
    const maxCount = parseInt(searchParams.get('maxCount') || '', 10);
    const status = (searchParams.get('status') || 'active').trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));

    const cutoff = dateCutoff(date);
    const { sets, sources } = await fetchSetSummaries({ searchTerm: q || undefined });

    const filtered = sets.filter(s => {
      if (q && !s.title.toLowerCase().includes(q) && !s.category.toLowerCase().includes(q)) return false;
      if (category && s.category !== category) return false;
      if (difficulty && !(s.difficulties[difficulty] > 0)) return false;
      if (source && s.source !== source) return false;
      if (createdBy && !s.createdBy.toLowerCase().includes(createdBy)) return false;
      if (cutoff && s.createdAt < cutoff) return false;
      if (Number.isFinite(minCount) && s.questionCount < minCount) return false;
      if (Number.isFinite(maxCount) && s.questionCount > maxCount) return false;
      if (status === 'active' && s.status === 'archived') return false;
      if (status === 'archived' && s.status !== 'archived') return false;
      if (status === 'published' && s.status !== 'published') return false;
      return true;
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return NextResponse.json({ sets: items, total, sources, page, pageSize });
  } catch (err: any) {
    console.error('[QuizSets GET] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}