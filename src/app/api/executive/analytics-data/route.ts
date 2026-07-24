import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminDb();

    const now = Date.now();
    const dayMs = 86400000;
    const last30Days = now - 30 * dayMs;

    const [usersSnap, quizzesSnap, questionsSnap, conversationsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('quizzes').get(),
      db.collection('question_bank').get(),
      db.collection('conversations').get(),
    ]);

    const users: Record<string, any>[] = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const quizzes: Record<string, any>[] = quizzesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const questions: Record<string, any>[] = questionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const conversations: Record<string, any>[] = conversationsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const getDateStr = (ts: number) => new Date(ts).toISOString().split('T')[0];

    const dailyBattles: Record<string, number> = {};
    const weeklyBattles: Record<string, number> = {};
    const monthlyUsers: Record<string, number> = {};
    const commanderActivity: Record<string, number> = {};
    const gladiatorParticipation: Record<string, number> = {};
    const categoryUsage: Record<string, number> = {};
    const aiUsage: Record<string, number> = {};
    const messageActivity: Record<string, number> = {};

    for (const q of quizzes) {
      const created = (q.created_at as number) || 0;
      if (created >= last30Days) {
        const ds = getDateStr(created);
        dailyBattles[ds] = (dailyBattles[ds] || 0) + 1;
      }
      const weekStart = new Date(created);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekStr = weekStart.toISOString().split('T')[0];
      weeklyBattles[weekStr] = (weeklyBattles[weekStr] || 0) + 1;
      const creator = q.created_by as string;
      if (creator) commanderActivity[creator] = (commanderActivity[creator] || 0) + 1;
      const pc = q.participantsCount as number;
      if (pc) {
        const ds = getDateStr(created);
        gladiatorParticipation[ds] = (gladiatorParticipation[ds] || 0) + pc;
      }
    }

    for (const u of users) {
      const created = (u.createdAt as number) || 0;
      if (created >= last30Days) {
        const ds = getDateStr(created);
        monthlyUsers[ds] = (monthlyUsers[ds] || 0) + 1;
      }
    }

    for (const q of questions) {
      const cat = (q.subject || q.category || 'General') as string;
      categoryUsage[cat] = (categoryUsage[cat] || 0) + 1;
      if ((q.createdBy as string) === 'ai_import' || (q.source as string) === 'ai') {
        const created = (q.created_at as number) || 0;
        if (created >= last30Days) {
          const ds = getDateStr(created);
          aiUsage[ds] = (aiUsage[ds] || 0) + 1;
        }
      }
    }

    for (const c of conversations) {
      const created = (c.createdAt as number) || 0;
      if (created >= last30Days) {
        const ds = getDateStr(created);
        messageActivity[ds] = (messageActivity[ds] || 0) + ((c.messageCount as number) || 1);
      }
    }

    const fillDateRange = (data: Record<string, number>, days: number): { date: string; value: number }[] => {
      const result: { date: string; value: number }[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now - i * dayMs);
        const ds = d.toISOString().split('T')[0];
        result.push({ date: ds, value: data[ds] || 0 });
      }
      return result;
    };

    const totalCommanders = users.filter(u => (u.role as string) === 'commander').length;
    const totalGladiators = users.filter(u => (u.role as string) === 'gladiator').length;

    return NextResponse.json({
      dailyBattles: fillDateRange(dailyBattles, 30),
      weeklyBattles: Object.entries(weeklyBattles).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })),
      monthlyUsers: fillDateRange(monthlyUsers, 30),
      commanderActivity: Object.entries(commanderActivity).sort(([, a], [, b]) => b - a).slice(0, 10).map(([id, count]) => {
        const u = users.find(us => us.id === id);
        return { name: ((u?.name as string) || id).slice(0, 20), value: count };
      }),
      gladiatorParticipation: fillDateRange(gladiatorParticipation, 30),
      categoryUsage: Object.entries(categoryUsage).sort(([, a], [, b]) => b - a).slice(0, 10).map(([name, value]) => ({ name, value })),
      aiUsage: fillDateRange(aiUsage, 30),
      messageActivity: fillDateRange(messageActivity, 30),
      summary: {
        totalBattles: quizzes.length,
        totalUsers: users.length,
        totalCommanders,
        totalGladiators,
        totalQuestions: questions.length,
        totalConversations: conversations.length,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Analytics data fetch failed' }, { status: 500 });
  }
}
