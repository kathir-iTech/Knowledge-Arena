import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp, FieldPath, Query } from 'firebase-admin/firestore';
import { COLLECTIONS, DEFAULT_PAGE_LIMIT } from '@/lib/constants';
import type { NotificationType } from '@/lib/constants';

export interface Notification {
  id?: string;
  type: NotificationType;
  title: string;
  description: string;
  read: boolean;
  createdAt: number;
  userId: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationCursor {
  id: string;
  createdAt: number;
}

export const notificationService = {
  async create(entry: Omit<Notification, 'id' | 'read'>): Promise<string> {
    try {
      const docRef = await getAdminDb().collection(COLLECTIONS.NOTIFICATIONS).add({
        ...entry,
        read: false,
        createdAt: Timestamp.fromMillis(entry.createdAt),
      });
      return docRef.id;
    } catch (err) {
      // Surface write failures loudly — callers rely on a non-empty id.
      console.error('[notificationService] create failed:', err);
      return '';
    }
  },

  /**
   * Cursor-based pagination straight from Firestore, ordered by createdAt desc
   * (with the document id as a deterministic tie-breaker). The previous
   * implementation fetched the newest 500 docs and sliced the first 100 in
   * memory, so anything older than that was permanently unreachable.
   */
  async getAll(options?: {
    limit?: number;
    unreadOnly?: boolean;
    userId?: string;
    cursor?: NotificationCursor | null;
  }): Promise<{ notifications: Notification[]; nextCursor: NotificationCursor | null }> {
    const pageSize = Math.max(1, Math.min(options?.limit || DEFAULT_PAGE_LIMIT, 100));
    let query: Query = getAdminDb()
      .collection(COLLECTIONS.NOTIFICATIONS)
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc');
    if (options?.userId) {
      query = query.where('userId', '==', options.userId);
    }
    if (options?.cursor) {
      query = query.startAfter(Timestamp.fromMillis(options.cursor.createdAt), options.cursor.id);
    }
    const snap = await query.limit(pageSize + 1).get();
    const hasMore = snap.docs.length > pageSize;
    const page = snap.docs.slice(0, pageSize);
    const createdAtOf = (d: FirebaseFirestore.QueryDocumentSnapshot): number =>
      d.data().createdAt?.toMillis?.() || d.data().createdAt || 0;

    let results = page.map(d => ({ id: d.id, ...d.data(), createdAt: createdAtOf(d) } as Notification));
    if (options?.unreadOnly) {
      results = results.filter(n => !n.read);
    }
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? { id: last.id, createdAt: createdAtOf(last) } : null;
    return { notifications: results, nextCursor };
  },

  async markRead(ids: string[], userId?: string): Promise<void> {
    const db = getAdminDb();
    const batch = db.batch();
    for (const id of ids.slice(0, 100)) {
      const ref = db.collection(COLLECTIONS.NOTIFICATIONS).doc(id);
      if (userId) {
        const snap = await ref.get().catch(() => null);
        if (!snap?.exists) continue;
        const data = snap.data();
        if (!data || data.userId !== userId) continue;
      }
      batch.update(ref, { read: true });
    }
    await batch.commit();
  },

  async markAllRead(userId?: string): Promise<void> {
    let query: Query = getAdminDb().collection(COLLECTIONS.NOTIFICATIONS);
    if (userId) {
      query = query.where('userId', '==', userId);
    }
    const snap = await query.limit(500).get();
    const unread = snap.docs.filter(d => !d.data().read);
    if (unread.length === 0) return;
    const batch = getAdminDb().batch();
    unread.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  },

  async delete(id: string): Promise<void> {
    await getAdminDb().collection(COLLECTIONS.NOTIFICATIONS).doc(id).delete();
  },

  async getUnreadCount(userId?: string): Promise<number> {
    let query: Query = getAdminDb().collection(COLLECTIONS.NOTIFICATIONS);
    if (userId) {
      query = query.where('userId', '==', userId);
    }
    const snap = await query.limit(500).get();
    return snap.docs.filter(d => !d.data().read).length;
  },
};
