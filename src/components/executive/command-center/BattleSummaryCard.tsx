'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Swords, Users, Wifi, Timer, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isOnline, getTimerInfo, rankParticipants } from '@/lib/command-center';
import type { CommandBattle } from '@/lib/command-center';

interface Props {
  battle: CommandBattle;
  now: number;
  selected: boolean;
  onClick: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  live: 'border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20',
  waiting: 'border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/20',
  ready: 'border-blue-300 text-blue-600 bg-blue-50 dark:bg-blue-950/20',
  starting: 'border-violet-300 text-violet-600 bg-violet-50 dark:bg-violet-950/20',
  paused: 'border-slate-400 text-slate-600 bg-slate-50 dark:bg-slate-950/20',
};

export function BattleSummaryCard({ battle, now, selected, onClick }: Props) {
  const online = battle.participants.filter(p => p.status !== 'blocked' && isOnline(p.lastSeen, now)).length;
  const leader = rankParticipants(battle.participants)[0];
  const progress = battle.questionCount > 0
    ? Math.min(1, (battle.current + 1) / battle.questionCount)
    : 0;
  const timer = getTimerInfo(battle, now);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-[14px] border p-4 transition-all group',
        selected
          ? 'border-primary/40 bg-primary/[0.03] shadow-elevation-hover'
          : 'border-border/60 bg-background hover:border-primary/25 hover:bg-muted/20'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            'w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0',
            battle.status === 'live' ? 'bg-emerald-500/10' : 'bg-primary/10'
          )}>
            <Swords className={cn('w-4 h-4', battle.status === 'live' ? 'text-emerald-600' : 'text-primary')} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate leading-tight">{battle.title}</p>
            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wide">{battle.id}</p>
          </div>
        </div>
        <Badge variant="outline" className={cn('text-[10px] h-5 capitalize shrink-0', STATUS_STYLE[battle.status] || '')}>
          {battle.status}
        </Badge>
      </div>

      <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {battle.participants.length}</span>
        <span className="flex items-center gap-1"><Wifi className="w-3 h-3 text-emerald-600" /> {online} online</span>
        <span className="capitalize">{battle.mode.replace(/_/g, ' ')}</span>
        <span className="ml-auto font-bold text-foreground tabular-nums">{Math.round(progress * 100)}%</span>
      </div>

      <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all duration-700"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        {timer.state === 'running' ? (
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold font-mono tabular-nums',
            timer.seconds <= 5 ? 'bg-red-500/10 text-red-600' : 'bg-primary/10 text-primary'
          )}>
            <Timer className="w-3 h-3" /> {timer.label}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground capitalize">
            {timer.state === 'paused' ? 'Paused' : battle.status}
          </span>
        )}
        {leader && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-600 min-w-0">
            <Trophy className="w-3 h-3 shrink-0" />
            <span className="truncate">{leader.name || leader.uid.slice(0, 8)}</span>
          </span>
        )}
      </div>
    </button>
  );
}