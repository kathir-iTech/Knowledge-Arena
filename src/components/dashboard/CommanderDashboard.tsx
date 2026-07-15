'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

import { PlusCircle, Trash2, Users, PlayCircle, Pencil, Copy, Download, FileText, Search as SearchIcon, Swords, MoreHorizontal, Calendar, Shield, HelpCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type SortKey = 'newest' | 'oldest' | 'title' | 'status';
type FilterKey = 'all' | 'active' | 'completed' | 'draft' | 'archived';

function escCsv(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function exportQuizCSV(quiz: ValidatedQuiz, participants: ValidatedParticipant[]) {
  const students = participants.filter(p => p.user_id !== quiz.created_by);
  const sorted = [...students].sort((a, b) => b.score - a.score);
  const rows = [['Rank', 'User ID', 'Name', 'Score', 'Status']];
  sorted.forEach((p, i) => {
    rows.push([String(i + 1), p.user_id, p.name || p.user_id.slice(0, 8), String(p.score), p.status]);
  });
  const csv = rows.map(r => r.map(c => escCsv(c)).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `arena-${quiz.id}-results.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const QuizCard = ({ quiz, onUpdate }: { quiz: ValidatedQuiz; onUpdate: () => void }) => {
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);
    const [isExporting, setIsExporting] = useState<'csv' | 'pdf' | null>(null);
    const [participants, setParticipants] = useState<ValidatedParticipant[]>([]);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    useEffect(() => {
        const sub = participantService.subscribeToParticipants(quiz.id, setParticipants);
        return () => { sub(); };
    }, [quiz.id]);

    const handleDelete = async () => {
        if (isProcessing) return;
        setIsProcessing(true);
        try {
            await quizService.deleteQuiz(quiz.id);
            toast({ title: 'Arena Purged', description: 'Arena and all data destroyed.' });
            onUpdate();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not delete arena.' });
        } finally {
            setIsProcessing(false);
            setShowDeleteDialog(false);
        }
    };

    const handleDuplicate = async () => {
      if (isProcessing) return;
      setIsProcessing(true);
      try {
        const newId = await quizService.duplicateQuiz(quiz.id, quiz.created_by);
        toast({ title: 'Arena Duplicated', description: `New room code: ${newId}` });
        onUpdate();
      } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not duplicate arena.' });
      } finally {
        setIsProcessing(false);
      }
    };

    const handleExportCSV = () => {
      if (isExporting) return;
      setIsExporting('csv');
      try {
        exportQuizCSV(quiz, participants);
        toast({ title: 'CSV Exported', description: `Results for ${quiz.title} downloaded.` });
      } catch {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to export CSV.' });
      } finally {
        setIsExporting(null);
      }
    };

    const escHtml = (v: string | number): string => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const handleExportPDF = () => {
      if (isExporting) return;
      setIsExporting('pdf');
      try {
        const students = participants.filter(p => p.user_id !== quiz.created_by);
        const sorted = [...students].sort((a, b) => b.score - a.score);
        const rows = sorted.map((p, i) => `<tr><td>${i + 1}</td><td>${escHtml(p.name || p.user_id.slice(0, 8))}</td><td>${p.score}</td><td>${escHtml(p.status)}</td></tr>`).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Arena Results - ${escHtml(quiz.title)}</title><style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:auto}h1{font-size:24px;margin-bottom:4px}.sub{color:#666;margin-bottom:24px}table{width:100%;border-collapse:collapse}th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #ddd}th{background:#f5f5f5;font-size:12px;text-transform:uppercase;letter-spacing:0.5px}.rank{font-weight:bold;font-size:18px;color:#333}</style></head><body><h1>${escHtml(quiz.title)}</h1><p class="sub">Room: ${escHtml(quiz.id)} &mdash; ${sorted.length} gladiator(s)</p><table><thead><tr><th>Rank</th><th>Name</th><th>Score</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          setTimeout(() => win.print(), 500);
        }
      } catch {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to export PDF.' });
      } finally {
        setIsExporting(null);
      }
    };

    const participantCount = participants?.filter(p => p.user_id !== quiz.created_by).length || 0;

    return (
        <Card className={cn(
          "transition-all duration-200 overflow-hidden",
          quiz.archived && "opacity-50"
        )}>
            <div className="relative">
              <div className={cn(
                "absolute top-0 left-0 w-1 h-full",
                quiz.status === 'live' ? "bg-success" :
                quiz.status === 'finished' ? "bg-primary" :
                quiz.archived ? "bg-muted" : "bg-warning"
              )} />
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xl md:text-2xl font-headline font-bold tracking-tight truncate">
                        {quiz.title}
                      </span>
                      <Badge className={cn(
                          "shrink-0 h-7 px-3 text-xs font-semibold",
                          quiz.archived ? "bg-muted/50 text-muted-foreground" :
                          quiz.status === 'live' ? "bg-success/10 text-success border border-success/20" :
                          quiz.status === 'finished' ? "bg-primary/10 text-primary border border-primary/20" :
                          "bg-warning/10 text-warning border border-warning/20"
                      )}>
                          <Shield className="w-3 h-3 mr-1" />
                          {quiz.archived ? 'Archived' : quiz.status === 'live' ? 'LIVE' : quiz.status === 'finished' ? 'Completed' : 'Waiting'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <span className="font-mono text-xs bg-muted/50 px-2.5 py-1 rounded-[6px] tracking-wider">{quiz.id}</span>
                      <span className="flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5" />
                        {quiz.question_count ?? 0} question{(quiz.question_count ?? 0) !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        {participantCount} gladiator{participantCount !== 1 ? 's' : ''}
                      </span>
                      {!!quiz.created_at && quiz.created_at > 0 && (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(quiz.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!quiz.archived && (
                      <Button asChild size="default" className="h-10 px-5 font-semibold">
                          <Link href={`/battle/${quiz.id}`}>
                            {quiz.status === 'waiting' ? (
                              <><Swords className="mr-2 h-4 w-4" /> Start Battle</>
                            ) : (
                              <><PlayCircle className="mr-2 h-4 w-4" /> Enter Arena</>
                            )}
                          </Link>
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="More actions">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {!quiz.archived && quiz.status === 'waiting' && (
                          <DropdownMenuItem asChild>
                            <Link href={`/commander/edit-arena/${quiz.id}`}>
                              <Pencil className="w-4 h-4 mr-2" /> Edit
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(quiz.id); toast({ title: 'Copied', description: `Room code ${quiz.id} copied.` }); }}>
                          <Copy className="w-4 h-4 mr-2" /> Copy Room Code
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDuplicate} disabled={isProcessing}>
                          {isProcessing ? <span className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Copy className="w-4 h-4 mr-2" />}
                           Duplicate
                        </DropdownMenuItem>
                        {quiz.status === 'finished' && !quiz.archived && (
                          <>
                            <DropdownMenuItem onClick={handleExportCSV} disabled={!!isExporting}>
                              {isExporting === 'csv' ? <span className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Download className="w-4 h-4 mr-2" />}
                              Export CSV
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExportPDF} disabled={!!isExporting}>
                              {isExporting === 'pdf' ? <span className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <FileText className="w-4 h-4 mr-2" />}
                              Export PDF
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setShowDeleteDialog(true); }} className="text-destructive focus:text-destructive" disabled={isProcessing}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>

            <AlertDialog open={showDeleteDialog} onOpenChange={(open) => { if (!isProcessing) setShowDeleteDialog(open); }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Arena?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>You are about to delete <strong className="text-foreground">{quiz.title}</strong>.</p>
                    {participantCount > 0 && (
                      <p className="text-destructive font-medium">{participantCount} gladiator{participantCount !== 1 ? 's' : ''} have joined this arena. All participant data will be lost.</p>
                    )}
                    <p>This action is permanent and cannot be undone.</p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={isProcessing} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                    {isProcessing ? 'Deleting...' : 'Destroy Forever'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
};

export default function CommanderDashboard() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<ValidatedQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchQuizzes = useCallback(() => {
    if (!user) return;
    setLoading(true);
    quizService.getQuizzesByCreator(user.id)
      .then(setQuizzes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { fetchQuizzes(); }, [fetchQuizzes]);

  const filteredAndSorted = useMemo(() => {
    let result = [...quizzes];

    if (filterKey === 'archived') {
      result = result.filter(q => q.archived);
    } else if (filterKey === 'active') {
      result = result.filter(q => !q.archived && (q.status === 'waiting' || q.status === 'live'));
    } else if (filterKey === 'completed') {
      result = result.filter(q => !q.archived && q.status === 'finished');
    } else if (filterKey === 'draft') {
      result = result.filter(q => !q.archived && q.status === 'waiting');
    } else {
      result = result.filter(q => !q.archived);
    }

    if (debouncedQuery.trim()) {
      const q = debouncedQuery.trim().toLowerCase();
      result = result.filter(quiz =>
        quiz.title.toLowerCase().includes(q) || quiz.id.toLowerCase().includes(q)
      );
    }

    if (sortKey === 'newest') result.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    else if (sortKey === 'oldest') result.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    else if (sortKey === 'title') result.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortKey === 'status') result.sort((a, b) => a.status.localeCompare(b.status));

    return result;
  }, [quizzes, debouncedQuery, sortKey, filterKey]);

  if (loading) return <LoadingScreen message="Loading arenas..." />;

  return (
    <div className="page-container safe-bottom animate-in">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 page-section safe-top">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-[14px] bg-primary/10">
              <Swords className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-page-title font-headline tracking-tight">Battle Control</h1>
          </div>
          <p className="text-base text-muted-foreground pl-[3.25rem]">Welcome back, {user?.name || 'Commander'}. Ready to create an arena?</p>
        </div>
        <Button asChild size="lg" className="h-12 px-6 text-base font-semibold gap-2">
            <Link href="/create-quiz"><PlusCircle className="h-4 w-4" />Create Arena</Link>
        </Button>
      </header>

      <div className="flex items-center gap-2.5 px-6 mb-4">
        <Swords className="w-5 h-5 text-primary" />
        <h2 className="text-section-title tracking-tight">Arena Library</h2>
        <span className="text-sm text-muted-foreground ml-auto">{filteredAndSorted.length} arena{filteredAndSorted.length !== 1 ? 's' : ''}</span>
      </div>

      <section className="page-section">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center mb-6">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search arenas by name or room code..."
            className="pl-10 h-11"
            aria-label="Search arenas"
          />
        </div>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="h-11 rounded-[12px] border border-input bg-background px-4 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Sort quizzes"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="title">By Title</option>
          <option value="status">By Status</option>
        </select>
        <div className="flex gap-1.5 flex-wrap">
          {[
            { key: 'all', label: 'All Arenas' },
            { key: 'active', label: 'Running' },
            { key: 'completed', label: 'Completed' },
            { key: 'draft', label: 'Draft' },
            { key: 'archived', label: 'Archived' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterKey(key as FilterKey)}
              className={cn(
                "px-3.5 py-1.5 rounded-[10px] text-xs font-medium transition-all duration-150",
                filterKey === key ? "bg-primary text-primary-foreground shadow-elevation-small" : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              )}
              aria-pressed={filterKey === key}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filteredAndSorted.map((q, i) => (
          <div key={q.id} className="animate-in" style={{ animationDelay: `${i * 50}ms` }}>
            <QuizCard quiz={q} onUpdate={fetchQuizzes} />
          </div>
        ))}
        {filteredAndSorted.length === 0 && (
            <div className="py-16 text-center border-2 border-dashed border-border/50 rounded-[18px]">
              <Swords className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <p className="text-base text-muted-foreground mb-4">
                {debouncedQuery
                  ? 'No arenas match your search.'
                  : filterKey === 'active'
                    ? 'No arenas are currently running.'
                    : filterKey === 'completed'
                      ? 'No completed arenas yet.'
                      : filterKey === 'draft'
                        ? 'No draft arenas yet.'
                        : filterKey === 'archived'
                          ? 'No archived arenas.'
                          : 'No arenas have been created yet.'
                }
              </p>
              {!debouncedQuery && filterKey === 'all' && (
                <Button asChild><Link href="/create-quiz"><PlusCircle className="mr-2 h-4 w-4" />Create Your First Arena</Link></Button>
              )}
            </div>
        )}
      </div>
      </section>
    </div>
  );
}




