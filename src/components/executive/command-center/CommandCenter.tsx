'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onSnapshot, query, collection, where, getDoc, doc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useAuth } from '@/hooks/useAuth';
import { participantService } from '@/services/participant.service';
import { questionService } from '@/services/game.service';
import { COLLECTIONS } from '@/lib/constants';
import {
  ACTIVE_BATTLE_STATUSES,
  battleSortKey,
  type CommandBattle,
  type CommandParticipant,
  type CommandQuestion,
  type LiveEvent,
} from '@/lib/command-center';
import type { QuizStatus } from '@/lib/constants';
import { CommandCenterStats } from '@/components/executive/command-center/CommandCenterStats';
import { BattleSummaryCard } from '@/components/executive/command-center/BattleSummaryCard';
import { BattleDetailPanel } from '@/components/executive/command-center/BattleDetailPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Radar } from 'lucide-react';

function toMillis(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (value && typeof (value as any).toMillis === 'function') return (value as any).toMillis();
  return null;
}

interface RawQuiz {
  id: string;
  title: string;
  status: QuizStatus;
  battle_mode?: string;
  current_question_index?: number;
  question_count?: number;
  question_start_at?: number | null;
  started_at?: number | null;
  paused_at?: number | null;
  created_by?: string;
  created_at?: number;
}

type Profile = { name?: string | null; avatar?: string | null };

function mapStatus(value: unknown): QuizStatus {
  const s = String(value || 'waiting');
  return (['draft', 'waiting', 'ready', 'starting', 'live', 'paused', 'finished', 'archived'] as const)
    .find(x => x === s) ?? 'waiting';
}

function eventId(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
}

export function CommandCenter() {
  const { user } = useAuth();
  const dbRef = useRef(initializeFirebase().firestore);

  const [quizzes, setQuizzes] = useState<Record<string, RawQuiz>>({});
  const [participantsByBattle, setParticipantsByBattle] = useState<Record<string, CommandParticipant[]>>({});
  const [questionsByBattle, setQuestionsByBattle] = useState<Record<string, CommandQuestion[]>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);

  const profilesRef = useRef<Record<string, Profile>>({});
  const prevPartsRef = useRef<Record<string, CommandParticipant[]>>({});
  const subsRef = useRef<Record<string, () => void>>({});
  const pendingRef = useRef(new Set<string>());

  // ---- Live clock for timers / presence ----
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- Active battle docs (quizzes where status is active) ----
  useEffect(() => {
    if (!user) return;
    const db = dbRef.current;
    const q = query(
      collection(db, COLLECTIONS.QUIZZES),
      where('status', 'in', ACTIVE_BATTLE_STATUSES)
    );
    const unsub = onSnapshot(q, snap => {
      const next: Record<string, RawQuiz> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        next[d.id] = {
          id: d.id,
          title: String(data.title || 'Untitled Battle'),
          status: mapStatus(data.status),
          battle_mode: data.battle_mode ? String(data.battle_mode) : 'synchronized',
          current_question_index: Number(data.current_question_index ?? -1),
          question_count: Number(data.question_count ?? 0),
          question_start_at: toMillis(data.question_start_at),
          started_at: toMillis(data.started_at),
          paused_at: toMillis(data.paused_at),
          created_by: data.created_by ? String(data.created_by) : undefined,
          created_at: Number(data.created_at ?? 0),
        };
      });
      setQuizzes(next);
      setSelected(prev => (prev && next[prev] ? prev : null));
      setReady(true);
    }, () => setReady(true));
    return () => unsub();
  }, [user]);

  // ---- Per-battle listeners for participants + questions ----
  useEffect(() => {
    if (!user) return;
    const subs = subsRef.current;
    const ids = Object.keys(quizzes);

    for (const id of ids) {
      if (subs[id]) continue;

      const unParticipants = participantService.subscribeToParticipants(id, list => {
        const parts: CommandParticipant[] = list.map(participant => ({
          uid: participant.user_id,
          name: participant.name ?? null,
          avatar: participant.avatar ?? null,
          score: Number(participant.score ?? 0),
          status: (participant.status as CommandParticipant['status']) || 'playing',
          ready: participant.ready === true,
          lastSeen: toMillis(participant.lastSeen),
          answeredIds: Array.isArray(participant.answered_question_ids)
            ? participant.answered_question_ids.map(String)
            : [],
          timedOutIds: Array.isArray(participant.timed_out_question_ids)
            ? participant.timed_out_question_ids.map(String)
            : [],
          skippedIds: Array.isArray(participant.skipped_question_ids)
            ? participant.skipped_question_ids.map(String)
            : [],
          violations: Number(participant.violations_count ?? 0),
        }));

        setParticipantsByBattle(prev => ({ ...prev, [id]: parts }));

        // live joins / leaves
        const prevParts = prevPartsRef.current[id];
        prevPartsRef.current[id] = parts;
        if (prevParts && prevParts.length > 0) {
          const newEvents: LiveEvent[] = [];
          const prevMap = new Map(prevParts.map(p => [p.uid, p]));
          for (const p of parts) {
            if (!prevMap.has(p.uid)) {
              newEvents.push({
                id: eventId('join'),
                battleId: id,
                type: 'joined',
                uid: p.uid,
                name: p.name || '',
                timestamp: Date.now(),
              });
            }
          }
          const currentUids = new Set(parts.map(p => p.uid));
          for (const p of prevParts) {
            if (!currentUids.has(p.uid)) {
              newEvents.push({
                id: eventId('left'),
                battleId: id,
                type: 'left',
                uid: p.uid,
                name: p.name || '',
                timestamp: Date.now(),
              });
            }
          }
          if (newEvents.length > 0) {
            setEvents(evts => [...newEvents, ...evts].slice(0, 30));
          }
        }

        for (const p of parts) {
          if (!profilesRef.current[p.uid] && !pendingRef.current.has(p.uid)) {
            pendingRef.current.add(p.uid);
            getDoc(doc(dbRef.current, COLLECTIONS.USERS, p.uid))
              .then(snap => {
                if (!snap.exists()) return;
                profilesRef.current[p.uid] = {
                  name: snap.data().name ?? null,
                  avatar: snap.data().avatar ?? null,
                };
                setProfiles({ ...profilesRef.current });
              })
              .finally(() => pendingRef.current.delete(p.uid));
          }
        }
      }, () => {});

      const unsubQ = questionService.subscribeToQuestions(id, list => {
        const mapped: CommandQuestion[] = list.map(q => ({
          id: q.id,
          index: Number(q.sort_index ?? 0),
          timer: Number(q.timer ?? 30),
        }));
        setQuestionsByBattle(prev => ({ ...prev, [id]: mapped }));
      }, () => {});

      subs[id] = () => { unParticipants(); unsubQ(); };
    }

    for (const k of Object.keys(subs)) {
      if (!ids.includes(k)) {
        try {
          subs[k]();
        } catch {}
        delete subs[k];
      }
    }
  }, [user, quizzes]);

  // full cleanup on unmount / auth change
  useEffect(() => {
    return () => {
      for (const k of Object.keys(subsRef.current)) {
        try {
          subsRef.current[k]();
        } catch {}
      }
      subsRef.current = {};
    };
  }, []);

  const sortedBattles = useMemo<CommandBattle[]>(() => {
    const list = Object.values(quizzes)
      .map(q => {
        const parts = (participantsByBattle[q.id] || []).map(p => ({
          ...p,
          name: profiles[p.uid]?.name ?? p.name ?? null,
          avatar: profiles[p.uid]?.avatar ?? p.avatar ?? null,
        }));
        return {
          id: q.id,
          title: q.title,
          status: q.status,
          mode: q.battle_mode || 'synchronized',
          current: q.current_question_index ?? -1,
          questionCount: q.question_count ?? 0,
          questionStartAt: q.question_start_at ?? null,
          startedAt: q.started_at ?? null,
          pausedAt: q.paused_at ?? null,
          commanderId: q.created_by ?? null,
          createdAt: q.created_at ?? 0,
          participants: parts,
          questions: questionsByBattle[q.id] || [],
        } satisfies CommandBattle;
      });
    list.sort((a, b) => {
      const rank = battleSortKey(a) - battleSortKey(b);
      return rank !== 0 ? rank : (b.createdAt || 0) - (a.createdAt || 0);
    });
    return list;
  }, [quizzes, participantsByBattle, questionsByBattle, profiles]);

  const activeId = selected && quizzes[selected] ? selected : (sortedBattles[0]?.id ?? null);
  const activeBattle = activeId ? sortedBattles.find(b => b.id === activeId) ?? null : null;
  const selectedEvents = events.filter(e => e.battleId === activeId);

  if (!ready) {
    return (
      <div className="page-container animate-in space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-in space-y-4 safe-bottom">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-page-title font-headline tracking-tight flex items-center gap-3">
            <Radar className="w-6 h-6 text-primary" />
            Battle Command Center
          </h1>
          <p className="text-sm text-muted-foreground">Live real-time monitoring of every active arena.</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-success bg-success/10 border border-success/20 rounded-full px-3 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
          </span>
          Live
        </div>
      </div>

      <CommandCenterStats battles={sortedBattles} now={now} />

      {sortedBattles.length === 0 ? (
        <div className="rounded-[14px] border border-border/40 bg-background p-10">
          <EmptyState
            icon={Radar}
            title="No Active Battles"
            description="When gladiators start an arena it will appear here in real time. No refresh needed."
          />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,380px)_1fr] gap-4 items-start">
          <div className="space-y-2 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
            {sortedBattles.map(b => (
              <BattleSummaryCard
                key={b.id}
                battle={b}
                now={now}
                selected={b.id === activeId}
                onClick={() => setSelected(b.id)}
              />
            ))}
          </div>
          <div className="min-w-0">
            {activeBattle ? (
              <BattleDetailPanel battle={activeBattle} now={now} events={selectedEvents} />
            ) : (
              <EmptyState icon={Radar} title="Select a Battle" description="Pick an active arena from the list." />
            )}
          </div>
        </div>
      )}
    </div>
  );
}