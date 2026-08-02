'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Swords, Wifi, Timer, Zap } from 'lucide-react';
import { isOnline } from '@/lib/command-center';
import type { CommandBattle } from '@/lib/command-center';

interface Props {
  battles: CommandBattle[];
  now: number;
}

export function CommandCenterStats({ battles, now }: Props) {
  const live = battles.filter(b => b.status === 'live').length;
  const queuing = battles.filter(
    b => b.status === 'waiting' || b.status === 'ready' || b.status === 'starting'
  ).length;
  const paused = battles.filter(b => b.status === 'paused').length;

  const online = new Set<string>();
  const totalPlayers = new Set<string>();
  for (const b of battles) {
    for (const p of b.participants) {
      totalPlayers.add(p.uid);
      if (p.status !== 'blocked' && isOnline(p.lastSeen, now)) online.add(p.uid);
    }
  }

  const tiles = [
    { icon: Swords, label: 'Live Battles', value: live },
    { icon: Timer, label: 'Queuing / Paused', value: queuing + paused },
    { icon: Wifi, label: 'Online Gladiators', value: online.size },
    { icon: Zap, label: 'Total Active Players', value: totalPlayers.size },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map(t => (
        <Card key={t.label} className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0">
              <t.icon className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight tabular-nums">{t.value}</p>
              <p className="text-[10px] text-muted-foreground truncate">{t.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}