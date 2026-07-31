import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp, Query } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/constants';

export interface AiLogEntry {
  userId: string;
  userRole: string;
  model: string;
  fileCount: number;
  fileTypes: string[];
  questionCount: number;
  difficulty: string;
  success: boolean;
  durationMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export const aiLogService = {
  async record(entry: AiLogEntry): Promise<void> {
    try {
      await getAdminDb().collection(COLLECTIONS.AI_LOGS).add({
        ...entry,
        createdAt: Timestamp.fromMillis(Date.now()),
      });
    } catch {
      /* log failures should never break the app */
    }
  },

  async getAll(options?: {
    limit?: number;
    userId?: string;
    success?: boolean;
    cursor?: string;
  }): Promise<{ logs: (AiLogEntry & { id: string; createdAt: number })[]; nextCursor: string | null; hasMore: boolean }> {
    let query: Query = getAdminDb()
      .collection(COLLECTIONS.AI_LOGS)
      .orderBy('createdAt', 'desc')
      .limit((options?.limit || 100) + 1);

    if (options?.userId) {
      query = query.where('userId', '==', options.userId);
    }
    if (options?.success !== undefined) {
      query = query.where('success', '==', options.success);
    }
    if (options?.cursor) {
      const cursorDoc = await getAdminDb().collection(COLLECTIONS.AI_LOGS).doc(options.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.get();
    const hasMore = snap.docs.length > (options?.limit || 100);
    const docs = snap.docs.slice(0, options?.limit || 100);

    const logs = docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toMillis?.() || data.createdAt,
      } as AiLogEntry & { id: string; createdAt: number };
    });

    return {
      logs,
      nextCursor: hasMore && docs.length > 0 ? docs[docs.length - 1].id : null,
      hasMore,
    };
  },
};
