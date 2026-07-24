'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Download, Filter, Clock, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogEntry {
  id: string;
  timestamp: number;
  actor: string;
  actorRole: string;
  action: string;
  target: string;
  metadata: Record<string, unknown>;
}

const actionLabels: Record<string, string> = {
  commander_created: 'Created Commander',
  commander_deleted: 'Deleted Commander',
  commander_disabled: 'Disabled Commander',
  commander_enabled: 'Enabled Commander',
  password_reset: 'Password Reset',
  question_added: 'Added Question',
  question_edited: 'Edited Question',
  question_deleted: 'Deleted Question',
  question_imported: 'Imported Questions',
  question_set_created: 'Created Question Set',
  arena_created: 'Created Arena',
  arena_started: 'Started Arena',
  arena_ended: 'Ended Arena',
  student_joined: 'Student Joined',
  student_kicked: 'Student Kicked',
  student_unblocked: 'Student Unblocked',
  message_sent: 'Message Sent',
  announcement_sent: 'Announcement Sent',
  settings_changed: 'Settings Changed',
};

const actionColors: Record<string, string> = {
  commander_created: 'text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800',
  commander_deleted: 'text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
  commander_disabled: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
  commander_enabled: 'text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800',
  password_reset: 'text-orange-600 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800',
};

function getActionColor(action: string): string {
  return actionColors[action] || 'text-muted-foreground bg-muted/30 border-border/50';
}

export default function AuditLogsPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);

  const fetchLogs = useCallback(async () => {
    if (!user) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      if (roleFilter) params.set('actorRole', roleFilter);
      const res = await fetch(`/api/executive/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setAvailableActions(data.filters?.actions || []);
        setAvailableRoles(data.filters?.roles || []);
        setTotalLogs(data.filters?.total || 0);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [user, auth, actionFilter, roleFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filtered = logs.filter(log => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.actor.toLowerCase().includes(q) ||
      log.target.toLowerCase().includes(q) ||
      (log.metadata?.displayName as string || '').toLowerCase().includes(q)
    );
  });

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="page-container animate-in space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="page-container animate-in safe-bottom">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight">Audit Logs</h1>
          <p className="text-base text-muted-foreground">Track all platform actions. {totalLogs > 0 && `${totalLogs} total entries.`}</p>
        </div>
        <Button variant="outline" onClick={exportJSON} disabled={filtered.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Export JSON
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="h-10 rounded-[10px] border border-input bg-background px-3 text-sm"
        >
          <option value="">All Actions</option>
          {availableActions.map(a => (
            <option key={a} value={a}>{actionLabels[a] || a.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="h-10 rounded-[10px] border border-input bg-background px-3 text-sm"
        >
          <option value="">All Roles</option>
          {availableRoles.map(r => (
            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-base text-muted-foreground">
              {logs.length === 0 ? 'No audit logs recorded yet.' : 'No logs match your search.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <ScrollArea className="max-h-[70vh]">
            <div className="divide-y divide-border/30">
              {filtered.map(log => (
                <div key={log.id} className="p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center mt-0.5">
                      <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn("text-[10px] h-5 font-normal border", getActionColor(log.action))}>
                          {actionLabels[log.action] || log.action.replace(/_/g, ' ')}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] h-5">{log.actorRole}</Badge>
                        <span className="text-xs text-muted-foreground font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-sm mt-1">
                        <span className="font-medium">Actor:</span> {log.actor}
                      </p>
                      {log.target && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium">Target:</span> {log.target}
                        </p>
                      )}
                      {Object.keys(log.metadata).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                          {JSON.stringify(log.metadata).slice(0, 120)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}
