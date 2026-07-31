'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Search, Download, BrainCircuit, CheckCircle2, XCircle, ChevronDown, ChevronRight, Loader2, Clock, FileText, Gauge } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

interface AiLogEntry {
  id: string;
  userId: string;
  userRole: string;
  model: string;
  fileCount: number;
  fileTypes: string[];
  questionCount: number;
  difficulty: string;
  success: boolean;
  durationMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

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

function formatDuration(ms: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
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

export default function AiLogsPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const [logs, setLogs] = useState<AiLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [successFilter, setSuccessFilter] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchLogs = useCallback(async (append = false) => {
    if (!user) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (successFilter) params.set('success', successFilter);
      if (append && nextCursor) params.set('cursor', nextCursor);
      const res = await fetch(`/api/executive/ai-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(prev => (append ? [...prev, ...(data.logs || [])] : data.logs || []));
        setNextCursor(data.nextCursor || null);
        setHasMore(data.hasMore || false);
        if (!append && data.logs) {
          setAvailableModels(Array.from(new Set((data.logs as AiLogEntry[]).map(l => l.model).filter(Boolean))).sort());
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, auth, modelFilter, successFilter, nextCursor]);

  useEffect(() => {
    fetchLogs(false);
  }, [successFilter]);

  const loadMore = () => {
    setLoadingMore(true);
    fetchLogs(true);
  };

  const filtered = logs.filter(log => {
    if (modelFilter && log.model !== modelFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (log.model || '').toLowerCase().includes(q) ||
      (log.userId || '').toLowerCase().includes(q) ||
      (log.userRole || '').toLowerCase().includes(q) ||
      (log.difficulty || '').toLowerCase().includes(q) ||
      (log.error || '').toLowerCase().includes(q) ||
      (log.fileTypes || []).some(t => t.toLowerCase().includes(q))
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
    a.download = `ai-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const successCount = logs.filter(l => l.success).length;
  const failCount = logs.length - successCount;

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
          <h1 className="text-page-title font-headline tracking-tight">AI Logs</h1>
          <p className="text-base text-muted-foreground">
            Question generation history. {logs.length > 0 && `${logs.length} loaded · ${successCount} success${failCount > 0 ? ` · ${failCount} failed` : ''}.`}
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
            placeholder="Search models, users, difficulties, errors..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={modelFilter}
          onChange={e => setModelFilter(e.target.value)}
          className="h-10 rounded-[10px] border border-input bg-background px-3 text-sm"
          aria-label="Filter by model"
        >
          <option value="">All Models</option>
          {availableModels.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={successFilter}
          onChange={e => setSuccessFilter(e.target.value)}
          className="h-10 rounded-[10px] border border-input bg-background px-3 text-sm"
          aria-label="Filter by result"
        >
          <option value="">All Results</option>
          <option value="true">Success</option>
          <option value="false">Failed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={BrainCircuit}
          title={logs.length === 0 ? 'No AI Logs' : 'No Results'}
          description={logs.length === 0 ? 'AI question generation activity will appear here as PDFs are converted to quizzes.' : 'No logs match your search or filter criteria.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(log => {
            const isExpanded = expandedIds.has(log.id);
            const metaEntries = formatMetadata(log.metadata || {});
            return (
              <Card key={log.id} className="hover:bg-accent/20 transition-colors">
                <CardContent className="p-0">
                  <button
                    onClick={() => toggleExpand(log.id)}
                    className="w-full flex items-start gap-3 p-4 text-left"
                  >
                    <div className={cn("shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5", log.success ? "bg-success/10" : "bg-destructive/10")}>
                      {log.success
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                        : <XCircle className="w-3.5 h-3.5 text-destructive" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn("text-[10px] h-5 font-normal border", log.success
                          ? "text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                          : "text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800")}>
                          {log.success ? 'SUCCESS' : 'FAILED'}
                        </Badge>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">{log.model || 'unknown model'}</span>
                        {log.difficulty && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize bg-muted text-muted-foreground">{log.difficulty}</span>
                        )}
                        <span className="text-xs text-muted-foreground">{formatTimestamp(log.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {log.fileCount || 0} file{log.fileCount !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <Gauge className="w-3 h-3" />
                          {log.questionCount || 0} questions
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(log.durationMs)}
                        </span>
                        <span className="font-mono truncate max-w-[180px]">{log.userId}</span>
                      </div>
                      {!log.success && log.error && (
                        <p className="text-xs text-destructive mt-1 truncate">{log.error}</p>
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
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Model</p>
                          <p className="text-sm font-mono">{log.model || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Role</p>
                          <p className="text-sm capitalize">{log.userRole || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">User ID</p>
                          <p className="text-sm font-mono">{log.userId}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">File Types</p>
                          <p className="text-sm">{(log.fileTypes || []).join(', ') || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Timestamp</p>
                          <p className="text-sm">{log.createdAt ? new Date(log.createdAt).toLocaleString() : 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Log ID</p>
                          <p className="text-xs font-mono text-muted-foreground">{log.id}</p>
                        </div>
                      </div>

                      {!log.success && log.error && (
                        <div className="mt-3 pt-3 border-t border-border/20">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Error</p>
                          <p className="text-sm font-mono break-all bg-destructive/5 text-destructive rounded-lg px-3 py-2">{log.error}</p>
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
