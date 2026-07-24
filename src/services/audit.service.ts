import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export interface AuditEntry {
  timestamp: number;
  actor: string;
  actorRole: string;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
}

export const auditService = {
  async record(entry: AuditEntry): Promise<void> {
    try {
      await getAdminDb().collection('auditLogs').add({
        ...entry,
        createdAt: Timestamp.fromMillis(entry.timestamp),
      });
    } catch {
      // audit failures should never break the app
    }
  },

  async getAll(options?: {
    limit?: number;
    action?: string;
    actorRole?: string;
    dateFrom?: number;
    dateTo?: number;
  }): Promise<(AuditEntry & { id: string })[]> {
    let query: FirebaseFirestore.Query = getAdminDb()
      .collection('auditLogs')
      .orderBy('timestamp', 'desc');

    if (options?.action) {
      query = query.where('action', '==', options.action);
    }
    if (options?.actorRole) {
      query = query.where('actorRole', '==', options.actorRole);
    }
    if (options?.dateFrom) {
      query = query.where('timestamp', '>=', options.dateFrom);
    }
    if (options?.dateTo) {
      query = query.where('timestamp', '<=', options.dateTo);
    }

    const snap = await query.limit(options?.limit || 100).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditEntry & { id: string }));
  },

  async getRecent(limit = 20): Promise<(AuditEntry & { id: string })[]> {
    const snap = await getAdminDb()
      .collection('auditLogs')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditEntry & { id: string }));
  },

  async getStats(): Promise<Record<string, number>> {
    const snap = await getAdminDb().collection('auditLogs').get();
    const counts: Record<string, number> = {};
    snap.docs.forEach(d => {
      const action = d.data().action as string;
      counts[action] = (counts[action] || 0) + 1;
    });
    return counts;
  },
};
