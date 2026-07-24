'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Search, Users, Shield, BookOpen, Layers, Swords, ClipboardList, MessageSquare, Megaphone, ArrowRight } from 'lucide-react';
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
  'Question Set': Layers,
  Battle: Swords,
  'Audit Log': ClipboardList,
  Conversation: MessageSquare,
  Announcement: Megaphone,
};

const typeColors: Record<string, string> = {
  Commander: 'text-purple-600 bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800',
  Gladiator: 'text-blue-600 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
  Executive: 'text-rose-600 bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800',
  Question: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
  'Question Set': 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800',
  Battle: 'text-rose-600 bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800',
  'Audit Log': 'text-slate-600 bg-slate-50 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800',
  Conversation: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800',
  Announcement: 'text-orange-600 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800',
};

export default function ExecutiveSearchPage() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setTotal(0);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/executive/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setTotal(data.total || 0);
      }
    } catch {
      // silently fail
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
        <p className="text-base text-muted-foreground">Search across all platform data.</p>
      </div>

      <div className="relative max-w-2xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Search commanders, gladiators, questions, battles..."
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

      {!loading && searched && results.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Search className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-base text-muted-foreground">No results found for &quot;{query}&quot;.</p>
          </CardContent>
        </Card>
      )}

      {!loading && results.length > 0 && (
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
                  {items.map(item => (
                    <Link key={`${item.type}-${item.id}`} href={item.href}>
                      <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
                        <CardContent className="p-4 flex items-center gap-3">
                          <div className="shrink-0 w-9 h-9 rounded-[8px] bg-muted flex items-center justify-center">
                            <Icon className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{item.title}</span>
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
                  ))}
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
