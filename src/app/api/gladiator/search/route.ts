import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'gladiator');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rl = enforceRateLimit(`gladiator:search:${auth.uid}`, Limits.SEARCH_PER_USER);
    if (rl) return rl;

    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('q')?.trim() || '';
    if (!raw || raw.length < 2) {
      return NextResponse.json({ results: [] });
    }
    const q = raw.toLowerCase();
    const db = getAdminDb();

    // Find participant docs for this gladiator
    const participantsSnap = await db.collectionGroup('participants')
      .where('user_id', '==', auth.uid)
      .select('user_id', 'score', 'status')
      .limit(100)
      .get();

    const participantData = participantsSnap.docs.map(d => ({ ref: d.ref, id: d.id }));
    const quizIds = [...new Set(participantData.map(p => p.ref.parent.parent?.id).filter(Boolean) as string[])];
    if (quizIds.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const quizMap = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < quizIds.length; i += 30) {
      const chunk = quizIds.slice(i, i + 30);
      const snaps = await db.getAll(...chunk.map(id => db.collection('quizzes').doc(id)));
      for (const s of snaps) {
        if (s.exists) quizMap.set(s.id, s.data()!);
      }
    }

    const results = [...quizMap.entries()]
      .map(([id, data]) => {
        const title = String(data.title || 'Untitled');
        const status = String(data.status || 'unknown');
        const searchable = [title, id, status].join(' ').toLowerCase();
        if (!searchable.includes(q)) return null;
        let score = 0;
        if (title.toLowerCase() === q) score = 4;
        else if (title.toLowerCase().startsWith(q)) score = 3;
        else score = 2;
        return {
          type: 'Battle',
          id,
          title,
          subtitle: `${status} · ${Number(data.question_count || 0)} questions · Code: ${id}`,
          href: `/battle/${id}`,
          score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b!.score as number) - (a!.score as number))
      .slice(0, 12);

    return NextResponse.json({ results });
  } catch (err: unknown) {
    console.error('[Gladiator Search] Error', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
