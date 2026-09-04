import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
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
  warnings: string[];
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(req, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitResponse = await enforceRateLimit(`executive:backup:${auth.uid}`, Limits.EXECUTIVE_EXPORT_PER_USER);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const db = getAdminDb();
    const timestamp = Date.now();
    const backupId = `backup_${timestamp}`;

    const collections = ['users', 'question_bank', 'quizzes', 'auditLogs', 'conversations', 'announcements', 'platform_settings', 'executive_requests'];

    const backup: BackupData = {
      metadata: {
        id: backupId,
        exportedAt: new Date(timestamp).toISOString(),
        exportedBy: auth.uid,
        version: '1.0',
        collections,
      },
      data: {},
      warnings: [],
    };

    for (const name of collections) {
      try {
        const snap = await db.collection(name).get();
        backup.data[name] = snap.docs.map(d => ({ id: d.id, ...d.data() })) as { id: string; [key: string]: unknown }[];
      } catch (err: any) {
        console.error(`[Backup Export] Failed to export collection "${name}":`, err?.message);
        backup.data[name] = [];
        backup.warnings.push(`Failed to export collection "${name}": ${err?.message || 'unknown error'}`);
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
  } catch (err: any) {
    console.error('[Backup Export] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  }
}
