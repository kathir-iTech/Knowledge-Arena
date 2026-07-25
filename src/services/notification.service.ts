import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS, DEFAULT_PAGE_LIMIT } from '@/lib/constants';
import type { NotificationType } from '@/lib/constants';

export interface Notification {
  id?: string;
  type: NotificationType;
  title: string;
  description: string;
  read: boolean;
  createdAt: number;
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

  async getAll(options?: { limit?: number; unreadOnly?: boolean }): Promise<Notification[]> {
    const snap = await getAdminDb().collection(COLLECTIONS.NOTIFICATIONS)
      .orderBy('createdAt', 'desc')
      .limit(options?.limit || DEFAULT_PAGE_LIMIT)
      .get();
    let results = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt } as Notification));
    if (options?.unreadOnly) {
      results = results.filter(n => !n.read);
    }
    return results;
  },

  async markRead(ids: string[]): Promise<void> {
    const batch = getAdminDb().batch();
    for (const id of ids) {
      batch.update(getAdminDb().collection(COLLECTIONS.NOTIFICATIONS).doc(id), { read: true });
    }
    await batch.commit();
  },

  async markAllRead(): Promise<void> {
    const snap = await getAdminDb().collection(COLLECTIONS.NOTIFICATIONS).where('read', '==', false).get();
    const batch = getAdminDb().batch();
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  },

  async delete(id: string): Promise<void> {
    await getAdminDb().collection(COLLECTIONS.NOTIFICATIONS).doc(id).delete();
  },

  async getUnreadCount(): Promise<number> {
    const snap = await getAdminDb().collection(COLLECTIONS.NOTIFICATIONS).where('read', '==', false).get();
    return snap.docs.length;
  },
};
