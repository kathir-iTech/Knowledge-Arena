'use client';

import React from 'react';
import { UserPlus, UserMinus } from 'lucide-react';
import type { LiveEvent } from '@/lib/command-center';

interface Props {
  events: LiveEvent[];
}

function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function ActivityFeed({ events }: Props) {
  const now = Date.now();
  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground">No live participant activity yet.</p>;
  }
  return (
    <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar pr-1">
      {events.map(e => (
        <div key={e.id} className="flex items-start gap-2 py-1.5 border-b border-border/10 last:border-0">
          {e.type === 'joined' ? (
            <UserPlus className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
          ) : (
            <UserMinus className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
          )}
          <span className="text-xs min-w-0 flex-1">
            <span className="font-medium">{e.name || e.uid.slice(0, 8)}</span>{' '}
            <span className="text-muted-foreground">{e.type === 'joined' ? 'joined' : 'left'} the battle</span>
          </span>
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">{timeAgo(e.timestamp, now)}</span>
        </div>
      ))}
    </div>
  );
}