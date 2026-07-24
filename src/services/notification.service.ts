import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export interface Notification {
  id?: string;
  type: 'commander_request' | 'gladiator_registration' | 'battle_completed' | 'ai_import_completed' | 'new_announcement' | 'new_message' | 'operation_failed' | 'system_warning';
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
      const docRef = await getAdminDb().collection('notifications').add({
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
    let query = getAdminDb().collection('notifications').orderBy('createdAt', 'desc');
    if (options?.unreadOnly) {
      query = query.where('read', '==', false);
    }
    const snap = await query.limit(options?.limit || 100).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt } as Notification));
  },

  async markRead(ids: string[]): Promise<void> {
    const batch = getAdminDb().batch();
    for (const id of ids) {
      batch.update(getAdminDb().collection('notifications').doc(id), { read: true });
    }
    await batch.commit();
  },

  async markAllRead(): Promise<void> {
    const snap = await getAdminDb().collection('notifications').where('read', '==', false).get();
    const batch = getAdminDb().batch();
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  },

  async delete(id: string): Promise<void> {
    await getAdminDb().collection('notifications').doc(id).delete();
  },

  async getUnreadCount(): Promise<number> {
    const snap = await getAdminDb().collection('notifications').where('read', '==', false).get();
    return snap.docs.length;
  },
};
