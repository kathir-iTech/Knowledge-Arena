'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { Search, Loader2, Swords, Shield, User, BookOpen, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  Arena: Swords,
  Battle: Swords,
  Commander: Shield,
  Gladiator: User,
  Executive: Shield,
  Question: BookOpen,
};

export function GlobalSearch() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Cmd+K / Ctrl+K handler — prevent browser conflict
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setError(null);
    }
  }, [open]);

  const fetchResults = useCallback(
    async (q: string) => {
      if (!user || !auth.currentUser) return;
      if (q.trim().length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const token = await auth.currentUser.getIdToken();
        let url = '';
        if (user.role === 'commander') url = `/api/commander/search?q=${encodeURIComponent(q)}`;
        else if (user.role === 'executive') url = `/api/executive/search?q=${encodeURIComponent(q)}`;
        else if (user.role === 'gladiator') url = `/api/gladiator/search?q=${encodeURIComponent(q)}`;
        else url = `/api/executive/search?q=${encodeURIComponent(q)}`;

        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 429) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Too many searches. Please wait.');
        }
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setResults((data.results || []) as SearchHit[]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Search failed';
        setError(msg);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [user, auth]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchResults]);

  const handleSelect = (hit: SearchHit) => {
    setOpen(false);
    router.push(hit.href);
  };

  if (!user) return null;

  return (
    <>
      {/* Hidden trigger for mobile / accessibility — also shows shortcut hint */}
      <button
        onClick={() => setOpen(true)}
        className="hidden"
        aria-label="Open search (Ctrl+K)"
        tabIndex={-1}
      />

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] p-4" role="dialog" aria-modal="true" aria-label="Global search">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg bg-card border border-border/40 rounded-[16px] shadow-elevation-large overflow-hidden animate-in">
            <div className="flex items-center gap-3 px-4 h-14 border-b border-border/40">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  user.role === 'commander'
                    ? 'Search your arenas by title...'
                    : user.role === 'executive'
                      ? 'Search commanders, battles, questions...'
                      : 'Search your battle history...'
                }
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                aria-label="Search"
              />
              {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono bg-muted px-1.5 py-1 rounded border">ESC</kbd>
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              {error && (
                <div className="p-4 flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4" /> {error}
                </div>
              )}
              {!loading && !error && query.trim().length < 2 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <p>Type at least 2 characters to search.</p>
                  <p className="text-xs mt-2">
                    {user.role === 'commander' && 'Search your own arenas by title.'}
                    {user.role === 'executive' && 'Search Commanders by name/email, battles by title.'}
                    {user.role === 'gladiator' && 'Search your battle history.'}
                  </p>
                  <p className="text-xs mt-3 font-mono bg-muted inline-flex px-2 py-1 rounded">
                    {typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘K' : 'Ctrl+K'} to open
                  </p>
                </div>
              )}
              {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">No results for &quot;{query}&quot;</div>
              )}
              {results.length > 0 && (
                <ul className="p-2 space-y-1">
                  {results.map((hit) => {
                    const Icon = TYPE_ICON[hit.type] || Swords;
                    return (
                      <li key={`${hit.type}:${hit.id}`}>
                        <button
                          onClick={() => handleSelect(hit)}
                          className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[10px] hover:bg-accent hover:text-accent-foreground transition-colors group"
                        >
                          <div className="flex items-center justify-center w-8 h-8 rounded-[8px] bg-muted group-hover:bg-accent-foreground/10 shrink-0">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground group-hover:bg-accent-foreground/15">{hit.type}</span>
                              <span className="text-sm font-medium truncate">{hit.title}</span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{hit.subtitle}</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground bg-muted/20">
              <span className="flex items-center gap-1.5">
                <kbd className="font-mono bg-background border px-1 py-0.5 rounded text-[10px]">↑↓</kbd> navigate
                <kbd className="font-mono bg-background border px-1 py-0.5 rounded text-[10px] ml-2">↵</kbd> select
              </span>
              <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
