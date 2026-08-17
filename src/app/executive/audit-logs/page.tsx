'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Search, Download, Filter, Clock, Activity, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
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
  arena_created: 'Created Arena',
  arena_started: 'Started Arena',
  arena_ended: 'Ended Arena',
  student_joined: 'Student Joined',
  student_kicked: 'Student Kicked',
  student_unblocked: 'Student Unblocked',
  message_sent: 'Message Sent',
  announcement_sent: 'Announcement Sent',
  settings_changed: 'Settings Changed',
  request_deleted: 'Request Deleted',
  request_handled: 'Request Handled',
  gladiator_deleted: 'Gladiator Deleted',
};

const actionColors: Record<string, string> = {
  commander_created: 'text-success bg-success/10 border-success/25 dark:bg-success/20',
  commander_deleted: 'text-destructive bg-destructive/10 border-destructive/25 dark:bg-destructive/20',
  commander_disabled: 'text-warning bg-warning/10 border-warning/25 dark:bg-warning/20',
  commander_enabled: 'text-success bg-success/10 border-success/25 dark:bg-success/20',
  password_reset: 'text-warning bg-warning/10 border-warning/25 dark:bg-warning/20',
  gladiator_deleted: 'text-destructive bg-destructive/10 border-destructive/25 dark:bg-destructive/20',
  request_deleted: 'text-destructive bg-destructive/10 border-destructive/25 dark:bg-destructive/20',
  request_handled: 'text-accent bg-accent/15 border-accent/30 dark:bg-accent/20',
  question_added: 'text-success bg-success/10 border-success/25 dark:bg-success/20',
  question_edited: 'text-accent bg-accent/15 border-accent/30 dark:bg-accent/20',
  question_deleted: 'text-destructive bg-destructive/10 border-destructive/25 dark:bg-destructive/20',
  question_imported: 'text-accent bg-accent/15 border-accent/30 dark:bg-accent/20',
  arena_created: 'text-primary bg-primary/10 border-primary/25 dark:bg-primary/20',
  arena_started: 'text-primary bg-primary/10 border-primary/25 dark:bg-primary/20',
  arena_ended: 'text-success bg-success/10 border-success/25 dark:bg-success/20',
  student_joined: 'text-accent bg-accent/15 border-accent/30 dark:bg-accent/20',
  student_kicked: 'text-destructive bg-destructive/10 border-destructive/25 dark:bg-destructive/20',
  student_unblocked: 'text-success bg-success/10 border-success/25 dark:bg-success/20',
  message_sent: 'text-muted-foreground bg-muted/40 border-border/60',
  announcement_sent: 'text-warning bg-warning/10 border-warning/25 dark:bg-warning/20',
  settings_changed: 'text-muted-foreground bg-muted/40 border-border/60',
};

function getActionColor(action: string): string {
  return actionColors[action] || 'text-muted-foreground bg-muted/30 border-border/50';
}

const actorRoleColors: Record<string, string> = {
  executive: 'bg-primary/10 text-primary border border-primary/25 dark:bg-primary/20',
  commander: 'bg-accent/15 text-accent border border-accent/30 dark:bg-accent/20',
  gladiator: 'bg-success/10 text-success border border-success/25 dark:bg-success/20',
};

function formatTimestamp(ts: number): string {
  if (!ts) return 'N/A';
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatMetadata(metadata: Record<string, unknown>): { label: string; value: string }[] {
  const entries: { label: string; value: string }[] = [];
  for (const [key, val] of Object.entries(metadata)) {
    if (val === null || val === undefined) continue;
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    let value: string;
    if (typeof val === 'object') {
      value = JSON.stringify(val);
    } else {
      value = String(val);
    }
    if (value.length > 200) value = value.slice(0, 200) + '...';
    entries.push({ label, value });
  }
  return entries;
}

export default function AuditLogsPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async (append = false) => {
    if (!user) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      if (roleFilter) params.set('actorRole', roleFilter);
      if (append) {
        if (actionFilter || roleFilter) params.set('page', String(page + 1));
        else if (nextCursor) params.set('cursor', nextCursor);
      }
      const res = await fetch(`/api/executive/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (append) {
          setAllLogs(prev => [...prev, ...(data.logs || [])]);
        } else {
          setAllLogs(data.logs || []);
        }
        setNextCursor(data.nextCursor || null);
        setHasMore(data.hasMore || false);
        setAvailableActions(data.filters?.actions || []);
        setAvailableRoles(data.filters?.roles || []);
        if (append && data.page) setPage(data.page);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, auth, actionFilter, roleFilter, nextCursor, page]);

  useEffect(() => {
    setPage(1);
    fetchLogs(false);
  }, [actionFilter, roleFilter]);

  const loadMore = () => {
    setLoadingMore(true);
    fetchLogs(true);
  };

  const filtered = allLogs.filter(log => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.actor.toLowerCase().includes(q) ||
      log.target.toLowerCase().includes(q) ||
      (log.metadata?.displayName as string || '').toLowerCase().includes(q)
    );
  });

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      <div className="page-container animate-in space-y-6">
        <div className="space-y-1.5">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-in safe-bottom">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight">Audit Logs</h1>
          <p className="text-base text-muted-foreground">Track all platform actions. {allLogs.length > 0 && `${allLogs.length} loaded.`}</p>
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
          aria-label="Filter by action"
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
          aria-label="Filter by role"
        >
          <option value="">All Roles</option>
          {availableRoles.map(r => (
            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Activity}
          title={allLogs.length === 0 ? 'No Audit Logs' : 'No Results'}
          description={allLogs.length === 0 ? 'Audit logs will appear here as actions are performed on the platform.' : 'No logs match your search or filter criteria.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(log => {
            const isExpanded = expandedIds.has(log.id);
            const metaEntries = formatMetadata(log.metadata);
            return (
              <Card key={log.id} className="hover:bg-accent/20 transition-colors">
                <CardContent className="p-0">
                  <button
                    onClick={() => toggleExpand(log.id)}
                    aria-expanded={isExpanded}
                    className="w-full flex items-start gap-3 p-4 text-left transition-colors duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center mt-0.5">
                      <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn("text-[10px] h-5 font-normal border", getActionColor(log.action))}>
                          {actionLabels[log.action] || log.action.replace(/_/g, ' ')}
                        </Badge>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", actorRoleColors[log.actorRole] || 'bg-muted text-muted-foreground')}>
                          {log.actorRole}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatTimestamp(log.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-sm font-medium">{log.actorRole ? `${log.actorRole.slice(0, 1).toUpperCase()}${log.actorRole.slice(1)}` : 'User'}</span>
                        {log.target && (
                          <>
                            <span className="text-xs text-muted-foreground">→</span>
                            <span className="text-sm text-muted-foreground truncate max-w-[200px]">{log.target}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 mt-1">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-border/30 mt-0">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Actor</p>
                          <p className="text-sm font-mono">{log.actor}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Action</p>
                          <p className="text-sm">{actionLabels[log.action] || log.action.replace(/_/g, ' ')}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Role</p>
                          <p className="text-sm capitalize">{log.actorRole}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Target</p>
                          <p className="text-sm font-mono">{log.target || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Timestamp</p>
                          <p className="text-sm">{log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Log ID</p>
                          <p className="text-xs font-mono text-muted-foreground">{log.id}</p>
                        </div>
                      </div>

                      {metaEntries.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/20">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Metadata</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {metaEntries.map(({ label, value }) => (
                              <div key={label} className="bg-muted/30 rounded-lg px-3 py-2">
                                <p className="text-[10px] text-muted-foreground">{label}</p>
                                <p className="text-sm font-mono break-all">{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {hasMore && (
            <div className="flex justify-center pt-2 pb-4">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {loadingMore ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
