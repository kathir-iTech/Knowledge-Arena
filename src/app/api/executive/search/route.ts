import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const query = q.toLowerCase();
    const [
      usersSnap,
      questionsSnap,
      setsSnap,
      quizzesSnap,
      auditSnap,
      conversationsSnap,
      announcementsSnap,
    ] = await Promise.all([
      getAdminDb().collection('users').get(),
      getAdminDb().collection('question_bank').get(),
      getAdminDb().collection('question_sets').get(),
      getAdminDb().collection('quizzes').get(),
      getAdminDb().collection('auditLogs').orderBy('timestamp', 'desc').limit(100).get(),
      getAdminDb().collection('conversations').get(),
      getAdminDb().collection('announcements').get(),
    ]);

    const results: Array<{
      type: string;
      id: string;
      title: string;
      subtitle: string;
      href: string;
      metadata?: Record<string, unknown>;
    }> = [];

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const name = ((data.name || data.displayName || '') as string).toLowerCase();
      const email = (data.email || '' as string).toLowerCase();
      if (name.includes(query) || email.includes(query) || doc.id.includes(query)) {
        const role = data.role as string || 'user';
        results.push({
          type: role === 'commander' ? 'Commander' : role === 'gladiator' ? 'Gladiator' : 'Executive',
          id: doc.id,
          title: (data.name || data.displayName || doc.id) as string,
          subtitle: `${role} · ${(data.email || '') as string}`,
          href: role === 'commander' ? '/executive/commanders' : '/executive/students',
          metadata: { uid: doc.id, role, email: data.email, avatar: data.avatar },
        });
      }
    }

    for (const doc of questionsSnap.docs) {
      const data = doc.data();
      const text = (data.question_text || data.text || '') as string;
      if (text.toLowerCase().includes(query)) {
        results.push({
          type: 'Question',
          id: doc.id,
          title: text.slice(0, 80),
          subtitle: `Question Bank · ${data.subject || data.category || 'General'}`,
          href: '/executive/question-bank',
        });
      }
    }

    for (const doc of setsSnap.docs) {
      const data = doc.data();
      const name = (data.name || '') as string;
      if (name.toLowerCase().includes(query)) {
        results.push({
          type: 'Question Set',
          id: doc.id,
          title: name,
          subtitle: `${(data.questions?.length || 0)} questions`,
          href: '/executive/question-sets',
        });
      }
    }

    for (const doc of quizzesSnap.docs) {
      const data = doc.data();
      const title = (data.title || data.name || '') as string;
      if (title.toLowerCase().includes(query) || doc.id.includes(query)) {
        results.push({
          type: 'Battle',
          id: doc.id,
          title: title || 'Untitled',
          subtitle: `Status: ${data.status || 'unknown'} · ${data.totalParticipants || 0} participants`,
          href: '/executive/workspace',
        });
      }
    }

    for (const doc of auditSnap.docs) {
      const data = doc.data();
      const actor = (data.actor || '') as string;
      const target = (data.target || '') as string;
      const action = (data.action || '') as string;
      if (actor.toLowerCase().includes(query) || target.toLowerCase().includes(query) || action.toLowerCase().includes(query)) {
        results.push({
          type: 'Audit Log',
          id: doc.id,
          title: (data.action || '').replace(/_/g, ' '),
          subtitle: `by ${data.actor} · ${data.target || ''}`,
          href: '/executive/audit-logs',
          metadata: { timestamp: data.timestamp },
        });
      }
    }

    for (const doc of conversationsSnap.docs) {
      const data = doc.data();
      const title = (data.title || data.name || '') as string;
      if (title.toLowerCase().includes(query)) {
        results.push({
          type: 'Conversation',
          id: doc.id,
          title: title || 'Untitled',
          subtitle: `${(data.participants?.length || 0)} participants`,
          href: '/executive/messages',
        });
      }
    }

    for (const doc of announcementsSnap.docs) {
      const data = doc.data();
      const title = (data.title || '') as string;
      const content = (data.content || data.message || '') as string;
      if (title.toLowerCase().includes(query) || content.toLowerCase().includes(query)) {
        results.push({
          type: 'Announcement',
          id: doc.id,
          title: title || 'Untitled',
          subtitle: (content as string).slice(0, 80),
          href: '/executive/messages',
        });
      }
    }

    results.sort((a, b) => a.title.localeCompare(b.title));
    const limited = results.slice(0, 50);

    return NextResponse.json({ results: limited, total: results.length });
  } catch (err: any) {
    console.error('[Search] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
