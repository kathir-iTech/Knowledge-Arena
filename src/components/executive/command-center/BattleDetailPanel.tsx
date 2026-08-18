'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Users, Wifi, Timer, Crown, Radio, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  isOnline,
  getTimerInfo,
  rankParticipants,
} from '@/lib/command-center';
import type { CommandBattle } from '@/lib/command-center';
import { ActivityHeatmap } from '@/components/executive/command-center/ActivityHeatmap';
import { WinnerPrediction } from '@/components/executive/command-center/WinnerPrediction';
import { ActivityFeed } from '@/components/executive/command-center/ActivityFeed';
import type { LiveEvent } from '@/lib/command-center';

interface Props {
  battle: CommandBattle;
  now: number;
  events: LiveEvent[];
}

const STATUS_STYLE: Record<string, string> = {
  live: 'border-success/30 text-success bg-success/10 dark:bg-success/20',
  waiting: 'border-warning/30 text-warning bg-warning/10 dark:bg-warning/20',
  ready: 'border-primary/30 text-primary bg-primary/10 dark:bg-primary/20',
  starting: 'border-accent/30 text-accent bg-accent/10 dark:bg-accent/20',
  paused: 'border-muted-foreground/30 text-muted-foreground bg-muted/40 dark:bg-muted/20',
};

export function BattleDetailPanel({ battle, now, events }: Props) {
  const leaderboard = rankParticipants(battle.participants);
  const online = battle.participants.filter(p => p.status !== 'blocked' && isOnline(p.lastSeen, now)).length;
  const progress = battle.questionCount > 0
    ? Math.min(100, Math.round(((battle.current + 1) / battle.questionCount) * 100))
    : 0;
  const timer = getTimerInfo(battle, now);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold tracking-tight truncate">{battle.title}</h2>
            <Badge variant="outline" className={cn('text-[10px] h-5 capitalize', STATUS_STYLE[battle.status] || '')}>
              {battle.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="font-mono uppercase">{battle.id}</span>
            <span className="capitalize">{battle.mode.replace(/_/g, ' ')}</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={cn('text-xl font-bold font-mono tabular-nums leading-none', timer.seconds <= 5 ? 'text-destructive' : 'text-foreground')}>
            {timer.state === 'running' ? timer.label : '—'}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{timer.state === 'paused' ? 'paused' : timer.state === 'running' ? 'left on timer' : 'no active timer'}</p>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>Question {battle.current >= 0 ? battle.current + 1 : 0} / {battle.questionCount}</span>
          <span className="font-semibold tabular-nums">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-2">
        <Mini icon={Users} label="Players" value={battle.participants.length} />
        <Mini icon={Wifi} label="Online" value={online} />
        <Mini icon={Timer} label={timer.state === 'running' ? 'Timer' : 'Status'} value={timer.state === 'running' ? timer.seconds + 's' : battle.status} />
      </div>

      {/* Leaderboard */}
      <Card className="card-hover overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/30 pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" /> Live Leaderboard
          </CardTitle>
          <span className="text-[10px] text-muted-foreground">{leaderboard.length} ranked</span>
        </CardHeader>
        <CardContent className="pt-3 max-h-64 overflow-y-auto custom-scrollbar">
          {leaderboard.length > 0 ? (
            <div className="space-y-1">
              {leaderboard.map((p, idx) => (
                <div key={p.uid} className={cn(
                  'flex items-center gap-2.5 p-2 rounded-[10px] transition-colors duration-300 ease-out animate-in',
                  idx === 0 && p.score > 0 ? 'bg-warning/10 border border-warning/25' : 'hover:bg-muted/30'
                )} style={{ animationDelay: `${Math.min(idx, 10) * 50}ms` }}>
                  <div className={cn(
                    'w-6 h-6 rounded-[8px] flex items-center justify-center text-[10px] font-bold shrink-0',
                    idx === 0 ? 'bg-warning text-background' : idx === 1 ? 'bg-muted-foreground/30 text-background' : 'bg-background text-muted-foreground border border-border/40'
                  )}>
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate leading-tight">
                      {p.name || p.uid.slice(0, 8)}
                      {p.status === 'finished' && <span className="ml-1.5 text-[10px] text-muted-foreground">done</span>}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {p.answeredIds.length} answered · {p.violations || 0} violations
                    </p>
                  </div>
                  <span className={cn('w-2 h-2 rounded-full shrink-0', isOnline(p.lastSeen, now) ? 'bg-success' : 'bg-muted-foreground/30')} title={isOnline(p.lastSeen, now) ? 'online' : 'offline'} />
                  <span className="text-sm font-bold tabular-nums w-10 text-right shrink-0">{p.score}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-2">No players yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Winner prediction */}
      <Card className="card-hover">
        <CardHeader className="border-b border-border/30 pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Crown className="w-4 h-4 text-warning" /> Winner Prediction
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <WinnerPrediction battle={battle} />
        </CardContent>
      </Card>

      {/* Activity heatmap */}
      <Card className="card-hover">
        <CardHeader className="border-b border-border/30 pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary" /> Answer Heatmap
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ActivityHeatmap battle={battle} />
        </CardContent>
      </Card>

      {/* Activity feed */}
      <Card className="card-hover">
        <CardHeader className="border-b border-border/30 pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Participant Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <ActivityFeed events={events} />
        </CardContent>
      </Card>
    </div>
  );
}

function Mini({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) {
  return (
    <div className="rounded-[12px] border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <p className="text-lg font-bold tabular-nums capitalize leading-none">{value}</p>
    </div>
  );
}