import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';

export const runtime = 'nodejs';

const ALLOWED_COLLECTIONS = new Set([
  'users', 'question_bank', 'question_sets', 'quizzes',
  'auditLogs', 'announcements', 'conversations', 'platform_settings', 'executive_requests',
]);

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const backup = body;

    if (!backup?.metadata?.collections || !backup?.data) {
      return NextResponse.json({ error: 'Invalid backup format' }, { status: 400 });
    }

    if (backup.metadata.version !== '1.0') {
      return NextResponse.json({ error: 'Unsupported backup version' }, { status: 400 });
    }

    const db = getAdminDb();
    const collections = backup.metadata.collections as string[];
    for (const name of collections) {
      if (!ALLOWED_COLLECTIONS.has(name)) {
        return NextResponse.json({ error: `Collection '${name}' is not allowed for import` }, { status: 400 });
      }
    }

    let totalDocs = 0;

    for (const name of collections) {
      const docs = backup.data[name] as Array<{ id: string; [key: string]: unknown }> || [];
      for (const doc of docs) {
        const { id, ...data } = doc;
        await db.collection(name).doc(id).set(data, { merge: true });
        totalDocs++;
      }
    }

    await auditService.record({
      timestamp: Date.now(),
      actor: auth.uid,
      actorRole: 'executive',
      action: 'backup_imported',
      target: backup.metadata.id || 'unknown',
      metadata: { collections: collections.join(','), totalDocs },
    });

    return NextResponse.json({ success: true, totalDocs, collections: collections.length });
  } catch {
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
