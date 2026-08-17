'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import {
  Search, Users, Shield, BookOpen, Swords, ClipboardList,
  MessageSquare, Megaphone, ArrowRight, AlertTriangle, RefreshCw,
  ShieldAlert, BrainCircuit, Bell, Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  metadata?: Record<string, unknown>;
}

const typeIcons: Record<string, React.ElementType> = {
  Commander: Shield,
  Gladiator: Users,
  Executive: Shield,
  Question: BookOpen,
  Battle: Swords,
  'Audit Log': ClipboardList,
  'Security Log': ShieldAlert,
  'AI Log': BrainCircuit,
  Conversation: MessageSquare,
  Announcement: Megaphone,
  Notification: Bell,
  Request: Inbox,
};

const typeColors: Record<string, string> = {
  Commander: 'text-accent bg-accent/15 border-accent/30 dark:bg-accent/20',
  Gladiator: 'text-success bg-success/10 border-success/25 dark:bg-success/20',
  Executive: 'text-primary bg-primary/10 border-primary/25 dark:bg-primary/20',
  Question: 'text-warning bg-warning/10 border-warning/25 dark:bg-warning/20',
  Battle: 'text-primary bg-primary/10 border-primary/25 dark:bg-primary/20',
  'Audit Log': 'text-muted-foreground bg-muted/40 border-border/60',
  'Security Log': 'text-destructive bg-destructive/10 border-destructive/25 dark:bg-destructive/20',
  'AI Log': 'text-accent bg-accent/15 border-accent/30 dark:bg-accent/20',
  Conversation: 'text-success bg-success/10 border-success/25 dark:bg-success/20',
  Announcement: 'text-warning bg-warning/10 border-warning/25 dark:bg-warning/20',
  Notification: 'text-muted-foreground bg-muted/40 border-border/60',
  Request: 'text-warning bg-warning/10 border-warning/25 dark:bg-warning/20',
};

function HighlightedTitle({ title, highlight }: { title: string; highlight?: { start: number; end: number } | null }) {
  if (!highlight || highlight.start < 0 || highlight.end <= highlight.start || highlight.end > title.length) {
    return <span className="text-sm font-medium truncate">{title}</span>;
  }
  return (
    <span className="text-sm font-medium truncate">
      {title.slice(0, highlight.start)}
      <mark className="bg-primary/15 text-primary rounded-[3px] px-0.5">{title.slice(highlight.start, highlight.end)}</mark>
      {title.slice(highlight.end)}
    </span>
  );
}

export default function ExecutiveSearchPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setTotal(0);
      setSearched(false);
      setError(null);
      return;
    }

    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError('You are not signed in. Please sign in and try again.');
        return;
      }
      const res = await fetch(`/api/executive/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setTotal(data.total || 0);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Search failed. Please try again.');
        setResults([]);
        setTotal(0);
      }
    } catch {
      setError('Network error. Check your connection and try again.');
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => doSearch(query), 200);
    return () => clearTimeout(timer);
  }, [query, user, doSearch]);

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="page-container animate-in space-y-6 safe-bottom">
      <div className="space-y-1.5">
        <h1 className="text-page-title font-headline tracking-tight">Global Search</h1>
        <p className="text-base text-muted-foreground">Search across users, questions, battles, logs, notifications, requests and more.</p>
      </div>

      <div className="relative max-w-2xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Search commanders, gladiators, questions, battles, logs..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-12 h-12 text-base rounded-xl"
        />
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <Card className="border-destructive/40">
          <CardContent className="py-10 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
            <p className="text-base font-medium mb-1">Search failed</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <button
              onClick={() => doSearch(query)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && searched && results.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Search className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-base text-muted-foreground">No results found for &quot;{query}&quot;.</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && results.length > 0 && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">{total} result{total !== 1 ? 's' : ''} for &quot;{query}&quot;</p>
          {sortedGroups.map(([type, items]) => {
            const Icon = typeIcons[type] || Search;
            const colorClass = typeColors[type] || 'text-muted-foreground bg-muted/30 border-border/50';
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">{type}</h2>
                  <Badge variant="outline" className="text-[10px] h-5">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map(item => {
                    const highlight = item.metadata?.highlight as { start: number; end: number } | null | undefined;
                    return (
                      <Link key={`${item.type}-${item.id}`} href={item.href}>
                        <Card className="hover:bg-muted/30 transition-all duration-300 ease-out cursor-pointer focus-visible:ring-2 focus-visible:ring-ring rounded-[18px]">
                          <CardContent className="p-4 flex items-center gap-3">
                            <div className="shrink-0 w-9 h-9 rounded-[8px] bg-muted flex items-center justify-center">
                              <Icon className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <HighlightedTitle title={item.title} highlight={highlight} />
                                <Badge variant="outline" className={cn("text-[10px] h-5 font-normal shrink-0", colorClass)}>
                                  {item.type}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !searched && (
        <Card>
          <CardContent className="py-16 text-center">
            <Search className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-base text-muted-foreground">Type at least 2 characters to search.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
