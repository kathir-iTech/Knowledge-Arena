'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Search, Download, ShieldAlert, ShieldCheck, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

interface SecurityEntry {
  id: string;
  event: string;
  actor: string;
  actorRole: string | null;
  target: string | null;
  detail: string | null;
  metadata: Record<string, unknown>;
  timestamp: number | null;
}

const eventLabels: Record<string, string> = {
  login_success: 'Login Success',
  login_failed: 'Login Failed',
  logout: 'Logout',
  invalid_token: 'Invalid Token',
  unauthorized_access: 'Unauthorized Access',
  session_replaced: 'Session Replaced',
  duplicate_session: 'Duplicate Session',
  suspicious_reconnect: 'Suspicious Reconnect',
  battle_join_denied: 'Battle Join Denied',
  rate_limited: 'Rate Limited',
  security_violation: 'Security Violation',
};

const eventColors: Record<string, string> = {
  login_success: 'text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800',
  logout: 'text-muted-foreground bg-muted/30 border-border/50',
  login_failed: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
  invalid_token: 'text-orange-600 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800',
  unauthorized_access: 'text-orange-600 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800',
  session_replaced: 'text-blue-600 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
  duplicate_session: 'text-blue-600 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
  suspicious_reconnect: 'text-purple-600 bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800',
  battle_join_denied: 'text-rose-600 bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800',
  rate_limited: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
  security_violation: 'text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
};

function getEventColor(event: string): string {
  return eventColors[event] || 'text-muted-foreground bg-muted/30 border-border/50';
}

function isBenign(event: string): boolean {
  return event === 'login_success' || event === 'logout';
}

const actorRoleColors: Record<string, string> = {
  executive: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  commander: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  gladiator: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

function formatTimestamp(ts: number | null): string {
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

export default function SecurityLogsPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const [logs, setLogs] = useState<SecurityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchLogs = useCallback(async (append = false) => {
    if (!user) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (eventFilter) params.set('event', eventFilter);
      if (append && nextCursor) params.set('cursor', nextCursor);
      const res = await fetch(`/api/executive/security-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(prev => (append ? [...prev, ...(data.logs || [])] : data.logs || []));
        setNextCursor(data.nextCursor || null);
        setHasMore(data.hasMore || false);
        setAvailableEvents(data.filters?.events || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, auth, eventFilter, nextCursor]);

  useEffect(() => {
    fetchLogs(false);
  }, [eventFilter]);

  const loadMore = () => {
    setLoadingMore(true);
    fetchLogs(true);
  };

  const filtered = logs.filter(log => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      log.event.toLowerCase().includes(q) ||
      (log.actor || '').toLowerCase().includes(q) ||
      (log.target || '').toLowerCase().includes(q) ||
      (log.detail || '').toLowerCase().includes(q)
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
    a.download = `security-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const riskyCount = logs.filter(l => !isBenign(l.event)).length;

  if (loading) {
    return (
      <div className="page-container animate-in space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
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
          <h1 className="text-page-title font-headline tracking-tight">Security Logs</h1>
          <p className="text-base text-muted-foreground">
            Authentication failures, violations &amp; session anomalies. {logs.length > 0 && `${logs.length} loaded · ${riskyCount} requiring attention.`}
          </p>
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
            placeholder="Search events, actors, targets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={eventFilter}
          onChange={e => setEventFilter(e.target.value)}
          className="h-10 rounded-[10px] border border-input bg-background px-3 text-sm"
          aria-label="Filter by event"
        >
          <option value="">All Events</option>
          {availableEvents.map(e => (
            <option key={e} value={e}>{eventLabels[e] || e.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ShieldCheck}
          title={logs.length === 0 ? 'No Security Logs' : 'No Results'}
          description={logs.length === 0 ? 'Security events will appear here as authentication and battle integrity checks run.' : 'No logs match your search or filter criteria.'}
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
                    className="w-full flex items-start gap-3 p-4 text-left"
                  >
                    <div className={cn("shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5", isBenign(log.event) ? "bg-muted" : "bg-destructive/10")}>
                      <ShieldAlert className={cn("w-3.5 h-3.5", isBenign(log.event) ? "text-muted-foreground" : "text-destructive")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn("text-[10px] h-5 font-normal border", getEventColor(log.event))}>
                          {eventLabels[log.event] || log.event.replace(/_/g, ' ')}
                        </Badge>
                        {log.actorRole && (
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", actorRoleColors[log.actorRole] || 'bg-muted text-muted-foreground')}>
                            {log.actorRole}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{formatTimestamp(log.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-sm font-medium font-mono truncate max-w-[200px]">{log.actor}</span>
                        {log.target && (
                          <>
                            <span className="text-xs text-muted-foreground">→</span>
                            <span className="text-sm text-muted-foreground truncate max-w-[200px]">{log.target}</span>
                          </>
                        )}
                      </div>
                      {log.detail && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{log.detail}</p>
                      )}
                    </div>
                    <div className="shrink-0 mt-1">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-border/30 mt-0">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Event</p>
                          <p className="text-sm">{eventLabels[log.event] || log.event.replace(/_/g, ' ')}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Actor</p>
                          <p className="text-sm font-mono">{log.actor}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Role</p>
                          <p className="text-sm capitalize">{log.actorRole || '—'}</p>
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

                      {log.detail && (
                        <div className="mt-3 pt-3 border-t border-border/20">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Detail</p>
                          <p className="text-sm font-mono break-all bg-muted/30 rounded-lg px-3 py-2">{log.detail}</p>
                        </div>
                      )}

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
