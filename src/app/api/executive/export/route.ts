import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

function toCSV(data: Record<string, unknown>[]): string {
  if (!data.length) return '';
  const headers = Object.keys(data[0]);
  const lines = [headers.join(',')];
  for (const row of data) {
    const vals = headers.map(h => {
      const v = row[h];
      if (v === null || v === undefined) return '';
      let s = String(v);
      if (s.startsWith('=') || s.startsWith('+') || s.startsWith('-') || s.startsWith('@') || s.startsWith('\t')) {
        s = `'${s}`;
      }
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    });
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

function toJSON(data: Record<string, unknown>[]): string {
  return JSON.stringify(data, null, 2);
}

const exportHandlers: Record<string, (db: FirebaseFirestore.Firestore) => Promise<Record<string, unknown>[]>> = {
  users: async (db) => {
    const snap = await db.collection('users').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  questions: async (db) => {
    const snap = await db.collection('question_bank').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  'question-sets': async (db) => {
    const snap = await db.collection('question_sets').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  battles: async (db) => {
    const snap = await db.collection('quizzes').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  'audit-logs': async (db) => {
    const snap = await db.collection('auditLogs').orderBy('timestamp', 'desc').limit(10000).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  analytics: async (db) => {
    const [usersSnap, quizzesSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('quizzes').get(),
    ]);
    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const battles = quizzesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    return [{ users: JSON.stringify(users), battles: JSON.stringify(battles), exportedAt: new Date().toISOString() }];
  },
};

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || '';
    const format = searchParams.get('format') || 'json';

    if (!type || !exportHandlers[type]) {
      return NextResponse.json({ error: `Invalid export type: ${type}. Valid: ${Object.keys(exportHandlers).join(', ')}` }, { status: 400 });
    }

    if (format !== 'csv' && format !== 'json') {
      return NextResponse.json({ error: 'Format must be csv or json' }, { status: 400 });
    }
    const db = getAdminDb();
    const data = await exportHandlers[type](db);

    const filename = `${type}-export-${new Date().toISOString().split('T')[0]}.${format}`;

    if (format === 'csv') {
      const csv = toCSV(data);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    const json = toJSON(data);
    return new NextResponse(json, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error('[Export] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
