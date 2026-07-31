import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp, Query } from 'firebase-admin/firestore';
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

export const notificationService = {
  async create(entry: Omit<Notification, 'id' | 'read'>): Promise<string> {
    try {
      const docRef = await getAdminDb().collection(COLLECTIONS.NOTIFICATIONS).add({
        ...entry,
        read: false,
        createdAt: Timestamp.fromMillis(entry.createdAt),
      });
      return docRef.id;
    } catch {
      return '';
    }
  },

  async getAll(options?: { limit?: number; unreadOnly?: boolean; userId?: string }): Promise<Notification[]> {
    let query: Query = getAdminDb().collection(COLLECTIONS.NOTIFICATIONS);
    if (options?.userId) {
      query = query.where('userId', '==', options.userId);
    }
    const snap = await query.limit(500).get();
    let results = snap.docs
      .map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt } as Notification))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, options?.limit || DEFAULT_PAGE_LIMIT);
    if (options?.unreadOnly) {
      results = results.filter(n => !n.read);
    }
    return results;
  },

  async markRead(ids: string[], userId?: string): Promise<void> {
    const db = getAdminDb();
    const batch = db.batch();
    for (const id of ids.slice(0, 100)) {
      const ref = db.collection(COLLECTIONS.NOTIFICATIONS).doc(id);
      if (userId) {
        const snap = await ref.get().catch(() => null);
        if (!snap?.exists) continue;
        if (snap.data().userId !== userId) continue;
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
