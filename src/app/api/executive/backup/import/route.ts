import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { auditService } from '@/services/audit.service';
import { Timestamp } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

const ALLOWED_COLLECTIONS = new Set([
  'users', 'question_bank', 'quizzes',
  'auditLogs', 'announcements', 'conversations', 'platform_settings', 'executive_requests',
]);

// Firestore Timestamps are serialized to JSON as { _seconds, _nanoseconds }.
// Restore them as real Timestamps so imported documents keep queryable,
// sortable date fields instead of corrupt map objects.
function restoreTimestamps(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    return value.map(v => restoreTimestamps(v, seen));
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return value;
    seen.add(value);
    const obj = value as Record<string, unknown>;
    if (
      typeof obj._seconds === 'number' &&
      typeof obj._nanoseconds === 'number' &&
      Object.keys(obj).every(k => k === '_seconds' || k === '_nanoseconds')
    ) {
      return Timestamp.fromMillis(obj._seconds * 1000 + Math.round(obj._nanoseconds / 1000));
    }
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = restoreTimestamps(val, seen);
    }
    return result;
  }
  return value;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'executive');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimitResponse = await enforceRateLimit(`executive:backup:${auth.uid}`, Limits.EXECUTIVE_EXPORT_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

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
        await db.collection(name).doc(id).set(restoreTimestamps(data) as Record<string, unknown>, { merge: true });
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
  } catch (err: any) {
    console.error('[Backup Import] Error:', err?.name, err?.message);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
