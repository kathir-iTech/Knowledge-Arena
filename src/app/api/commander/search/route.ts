import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rl = enforceRateLimit(`commander:search:${auth.uid}`, Limits.SEARCH_PER_USER);
    if (rl) return rl;

    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('q')?.trim() || '';
    if (!raw || raw.length < 2) {
      return NextResponse.json({ results: [] });
    }
    const q = raw.toLowerCase();
    const db = getAdminDb();
    // Fetch own quizzes (limit 200) and filter by title/id
    const snap = await db.collection('quizzes')
      .where('created_by', '==', auth.uid)
      .select('title', 'status', 'created_at', 'question_count')
      .limit(200)
      .get();

    const results = snap.docs
      .map(d => {
        const data = d.data() as Record<string, unknown>;
        const title = String(data.title || 'Untitled');
        const id = d.id;
        // Score via simple contains; use searchTokens pattern if available (fallback to title)
        const searchable = [title, id].join(' ').toLowerCase();
        if (!searchable.includes(q)) return null;
        // Score: exact > startsWith > includes
        let score = 0;
        if (title.toLowerCase() === q) score = 4;
        else if (title.toLowerCase().startsWith(q)) score = 3;
        else if (searchable.includes(q)) score = 2;
        return {
          type: 'Arena',
          id,
          title,
          subtitle: `${String(data.status || 'unknown')} · ${Number(data.question_count || 0)} questions · Code: ${id}`,
          href: `/battle/${id}`,
          score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b!.score as number) - (a!.score as number))
      .slice(0, 12);

    return NextResponse.json({ results });
  } catch (err: unknown) {
    console.error('[Commander Search] Error', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
