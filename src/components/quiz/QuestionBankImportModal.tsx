'use client';

import React, { useState, useEffect } from 'react';
import { useFirebase } from '@/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, BookOpen, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COLLECTIONS } from '@/lib/constants';

export interface BankQuestion {
  id: string;
  text: string;
  options: string[];
  correct_option_index: number;
  category?: string;
  difficulty?: string;
}

interface QuestionBankImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (questions: BankQuestion[]) => void;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-success/10 text-success border-success/20',
  moderate: 'bg-warning/10 text-warning border-warning/20',
  hard: 'bg-destructive/10 text-destructive border-destructive/20',
};

export function QuestionBankImportModal({ open, onOpenChange, onImport }: QuestionBankImportModalProps) {
  const { firestore } = useFirebase();
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !firestore) return;
    setLoading(true);
    setSelected(new Set());
    setSearch('');
    const load = async () => {
      try {
        const q = query(collection(firestore, COLLECTIONS.QUESTION_BANK), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const items: BankQuestion[] = snap.docs.map(d => ({
          id: d.id,
          text: d.data().text as string,
          options: d.data().options as string[],
          correct_option_index: d.data().correct_option_index as number,
          category: d.data().category as string | undefined,
          difficulty: d.data().difficulty as string | undefined,
        }));
        setQuestions(items);
      } catch {
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, firestore]);

  const filtered = questions.filter(q =>
    q.text.toLowerCase().includes(search.toLowerCase()) ||
    (q.category && q.category.toLowerCase().includes(search.toLowerCase()))
  );

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(q => q.id)));
    }
  };

  const handleImport = () => {
    const imported = questions.filter(q => selected.has(q.id));
    onImport(imported);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Import from Question Bank
          </DialogTitle>
          <DialogDescription>
            Select questions from your saved question bank to add to this arena. Questions are copied so bank edits won&apos;t affect this arena.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search questions or categories..."
              className="pl-9"
            />
          </div>
          {filtered.length > 0 && (
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {selected.size === filtered.length ? 'Deselect All' : 'Select All'}
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[400px] space-y-2 pr-1">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-3 rounded-[12px] border border-border/40 space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BookOpen className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? 'No questions match your search.' : 'Your question bank is empty.'}
              </p>
            </div>
          ) : (
            filtered.map(q => (
              <button
                key={q.id}
                onClick={() => toggleSelect(q.id)}
                className={cn(
                  'w-full text-left p-3 rounded-[12px] border transition-colors',
                  selected.has(q.id)
                    ? 'bg-primary/5 border-primary/30'
                    : 'bg-background border-border/40 hover:bg-muted/30'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'mt-0.5 flex items-center justify-center w-5 h-5 rounded-md border shrink-0 transition-colors',
                    selected.has(q.id)
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border'
                  )}>
                    {selected.has(q.id) && <Check className="w-3 h-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-relaxed line-clamp-2">{q.text}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {q.difficulty && (
                        <Badge variant="outline" className={cn('text-[10px] h-5', DIFFICULTY_COLORS[q.difficulty] || '')}>
                          {q.difficulty}
                        </Badge>
                      )}
                      {q.category && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          {q.category}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {q.options.length} options
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <p className="text-xs text-muted-foreground flex-1">
            {selected.size} question{selected.size !== 1 ? 's' : ''} selected
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleImport} disabled={selected.size === 0}>
            Import {selected.size > 0 ? `${selected.size} ` : ''}Question{selected.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
