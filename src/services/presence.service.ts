'use client';

import { initializeFirebase } from '@/firebase';
import { ref, set, remove, onDisconnect, onValue, off, type DataSnapshot } from 'firebase/database';

export type PresenceRole = 'commander' | 'gladiator';

export interface PresenceEntry {
  role: PresenceRole;
  online: boolean;
}

export type PresenceMap = Record<string, PresenceEntry>;

function presencePath(battleId: string, uid?: string) {
  return uid ? `presence/${battleId}/${uid}` : `presence/${battleId}`;
}

export const presenceService = {
  // Registers the current user as present in a battle's RTDB presence node and
  // arms an onDisconnect so the node is removed when the client disconnects
  // (tab close, network drop or crash). Watching `.info/connected` re-writes the
  // presence node whenever the connection (re)establishes, so a reconnect or
  // page-show does not leave the user invisible. Returns a cleanup that stops
  // the connected watcher, cancels the onDisconnect handler and removes the node
  // on intentional leave.
  setPresence(battleId: string, uid: string, role: PresenceRole): () => void {
    const db = initializeFirebase().rtdb;
    const presenceRef = ref(db, presencePath(battleId, uid));
    const connectedRef = ref(db, '.info/connected');
    let disposed = false;
    let activeHandle: { cancel: () => void } | null = null;

    const writePresence = () => {
      if (disposed) return;
      if (activeHandle) {
        activeHandle.cancel();
        activeHandle = null;
      }
      const handle = onDisconnect(presenceRef);
      handle.remove().catch(() => {});
      set(presenceRef, { role, online: true }).catch(() => handle.cancel());
      activeHandle = handle;
    };

    const unsubConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) writePresence();
    });

    return () => {
      disposed = true;
      unsubConnected();
      if (activeHandle) activeHandle.cancel();
      remove(presenceRef).catch(() => {});
    };
  },

  async clearPresence(battleId: string, uid: string): Promise<void> {
    try {
      await remove(ref(initializeFirebase().rtdb, presencePath(battleId, uid)));
    } catch {
      // Best-effort cleanup; the armed onDisconnect removes the node if the
      // connection drops before this call succeeds.
    }
  },

  subscribeToPresence(battleId: string, callback: (presence: PresenceMap) => void): () => void {
    const presenceRef = ref(initializeFirebase().rtdb, presencePath(battleId));
    const handler = (snap: DataSnapshot) => {
      const raw = snap.val();
      const map: PresenceMap = {};
      if (raw && typeof raw === 'object') {
        for (const uid of Object.keys(raw)) {
          const entry = raw[uid];
          if (entry && typeof entry === 'object') {
            map[uid] = {
              role: entry.role === 'gladiator' ? 'gladiator' : 'commander',
              online: entry.online !== false,
            };
          }
        }
      }
      callback(map);
    };
    onValue(presenceRef, handler);
    return () => off(presenceRef, 'value', handler);
  },
};