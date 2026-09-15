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
  error?: string | null;
  metadata?: Record<string, unknown>;
}

export const aiLogService = {
  async record(entry: AiLogEntry): Promise<void> {
    try {
      const data: Record<string, unknown> = { ...entry, createdAt: Timestamp.fromMillis(Date.now()) };
      // Firestore rejects undefined as a field value — strip optional fields that
      // weren't provided so the document only contains valid values.
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined) delete (data as Record<string, unknown>)[key];
      }
      await getAdminDb().collection(COLLECTIONS.AI_LOGS).add(data);
    } catch (err) {
      console.error('[AI-Log] Failed to record ai_log:', err);
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
