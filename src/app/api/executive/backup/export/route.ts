import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';

export const runtime = 'nodejs';

interface BackupData {
  metadata: {
    id: string;
    exportedAt: string;
    exportedBy: string;
    version: string;
    collections: string[];
  };
  data: Record<string, { id: string; [key: string]: unknown }[]>;
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminDb();
    const timestamp = Date.now();
    const backupId = `backup_${timestamp}`;

    const collections = ['users', 'question_bank', 'question_sets', 'quizzes', 'auditLogs', 'conversations', 'announcements', 'platform_settings', 'executive_requests'];

    const backup: BackupData = {
      metadata: {
        id: backupId,
        exportedAt: new Date(timestamp).toISOString(),
        exportedBy: auth.uid,
        version: '1.0',
        collections,
      },
      data: {},
    };

    for (const name of collections) {
      try {
        const snap = await db.collection(name).get();
        backup.data[name] = snap.docs.map(d => ({ id: d.id, ...d.data() })) as { id: string; [key: string]: unknown }[];
      } catch {
        backup.data[name] = [];
      }
    }

    await auditService.record({
      timestamp,
      actor: auth.uid,
      actorRole: 'executive',
      action: 'backup_created',
      target: backupId,
      metadata: { collections: collections.join(',') },
    });

    return NextResponse.json(backup);
  } catch {
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  }
}
