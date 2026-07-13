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

import { PlusCircle, Loader2, Trash2, Users, RefreshCw, PlayCircle, Pencil, Copy, Archive, ArchiveRestore, Download, FileText, Search as SearchIcon, Swords, MoreHorizontal, Calendar, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Progress } from '@/components/ui/progress';

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
    const [participants, setParticipants] = useState<ValidatedParticipant[]>([]);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showResetDialog, setShowResetDialog] = useState(false);

    useEffect(() => {
        const sub = participantService.subscribeToParticipants(quiz.id, setParticipants);
        return () => { sub(); };
    }, [quiz.id]);

    const handleResetStudent = async (sid: string) => {
        try {
            await participantService.unblockParticipant(quiz.id, sid);
            toast({ title: 'Gladiator Reset', description: 'Malpractice block has been cleared.' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to reset gladiator.' });
        }
    };

    const handleDelete = async () => {
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

    const handleResetQuiz = async () => {
        setIsProcessing(true);
        try {
            await quizService.resetQuiz(quiz.id);
            toast({ title: 'Arena Reset', description: 'Room returned to waiting state.' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not reset arena.' });
        } finally {
            setIsProcessing(false);
            setShowResetDialog(false);
        }
    };

    const handleDuplicate = async () => {
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

    const handleArchiveToggle = async () => {
      setIsProcessing(true);
      try {
        await quizService.updateQuiz(quiz.id, { archived: !quiz.archived });
        toast({ title: quiz.archived ? 'Arena Restored' : 'Arena Archived', description: quiz.archived ? 'Arena is visible again.' : 'Arena moved to archive.' });
        onUpdate();
      } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not update arena.' });
      } finally {
        setIsProcessing(false);
      }
    };

    const handleExportCSV = () => {
      exportQuizCSV(quiz, participants);
    };

    const escHtml = (v: string | number): string => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const handleExportPDF = () => {
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
    };

    const participantCount = participants?.filter(p => p.user_id !== quiz.created_by).length || 0;
    const completedCount = participants?.filter(p => p.status === 'finished' && p.user_id !== quiz.created_by).length || 0;

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
                      <Link href={`/battle/${quiz.id}`} className="text-xl md:text-2xl font-headline font-bold tracking-tight hover:text-primary transition-colors truncate">
                        {quiz.title}
                      </Link>
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
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="font-mono text-xs bg-muted/50 px-2.5 py-1 rounded-[6px] tracking-wider">{quiz.id}</span>
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
                        <DropdownMenuItem onClick={handleDuplicate} disabled={isProcessing}>
                          <Copy className="w-4 h-4 mr-2" /> Duplicate
                        </DropdownMenuItem>
                        {quiz.status === 'finished' && !quiz.archived && (
                          <>
                            <DropdownMenuItem onClick={handleExportCSV}>
                              <Download className="w-4 h-4 mr-2" /> Export CSV
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExportPDF}>
                              <FileText className="w-4 h-4 mr-2" /> Export PDF
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        {quiz.status === 'finished' && !quiz.archived && (
                          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setShowResetDialog(true); }}>
                            <RefreshCw className="w-4 h-4 mr-2" /> Reset
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={handleArchiveToggle} disabled={isProcessing}>
                          {quiz.archived ? <ArchiveRestore className="w-4 h-4 mr-2" /> : <Archive className="w-4 h-4 mr-2" />}
                          {quiz.archived ? 'Restore' : 'Archive'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setShowDeleteDialog(true); }} className="text-destructive focus:text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {!quiz.archived && participantCount > 0 && (
                  <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border/40">
                    <Progress value={(completedCount / participantCount) * 100} className="h-1.5 flex-1" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{completedCount}/{participantCount} gladiators finished</span>
                  </div>
                )}

                {participants?.some(p => p.status === 'blocked') && (
                  <div className="mt-4 pt-4 border-t border-border/40">
                    <div className="p-3 bg-destructive/5 rounded-[12px] border border-destructive/10 space-y-2">
                      <p className="text-[11px] font-semibold text-destructive uppercase tracking-wider">Blocked Gladiators:</p>
                      {participants.filter(p => p.status === 'blocked').map(p => (
                        <div key={p.user_id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px]">B</AvatarFallback></Avatar>
                            <span className="text-sm">{p.user_id.slice(0, 12)}</span>
                          </div>
                          <Button size="sm" variant="ghost" className="h-8 px-3 text-xs text-destructive hover:bg-destructive/10" onClick={() => handleResetStudent(p.user_id)}>Unblock</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Arena?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will purge all scores and gladiator entries. The room will return to the 'Waiting' state.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep results</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetQuiz}>Reset Room</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Arena?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action is permanent. The arena and all gladiator history will be destroyed forever.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Destroy Forever</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
};

export default function CommanderDashboard() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<ValidatedQuiz[]>([]);
  const [allParticipants, setAllParticipants] = useState<ValidatedParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');

  const fetchQuizzes = useCallback(() => {
    if (!user) return;
    Promise.all([
      quizService.getQuizzesByCreator(user.id),
      participantService.getAllParticipantsBulk([]).catch(() => [] as ValidatedParticipant[]),
    ])
      .then(([qs, parts]) => {
        setQuizzes(qs);
        setAllParticipants(parts);
      })
      .catch(e => console.error(e))
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

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(quiz =>
        quiz.title.toLowerCase().includes(q) || quiz.id.toLowerCase().includes(q)
      );
    }

    if (sortKey === 'newest') result.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    else if (sortKey === 'oldest') result.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    else if (sortKey === 'title') result.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortKey === 'status') result.sort((a, b) => a.status.localeCompare(b.status));

    return result;
  }, [quizzes, searchQuery, sortKey, filterKey]);

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
            { key: 'archived', label: 'Archived' }
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
                {searchQuery ? 'No arenas match your search.' : 'No arenas have been created yet.'}
              </p>
              {!searchQuery && (
                <Button asChild><Link href="/create-quiz"><PlusCircle className="mr-2 h-4 w-4" />Create Your First Arena</Link></Button>
              )}
            </div>
        )}
      </div>
      </section>

      <section className="page-section">
        <StudentActivity quizzes={quizzes} commanderId={user?.id} />
      </section>
    </div>
  );
}

interface StudentSummary {
  userId: string;
  name: string;
  quizCount: number;
  totalScore: number;
}

function StudentActivity({ quizzes, commanderId }: { quizzes: ValidatedQuiz[]; commanderId?: string }) {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!quizzes.length || !commanderId) { setLoading(false); return; }
    let cancelled = false;
    participantService.getAllParticipantsBulk(quizzes.map(q => q.id)).then(all => {
      if (cancelled) return;
      const grouped = new Map<string, { name: string; quizCount: number; totalScore: number }>();
      for (const p of all) {
        if (p.user_id === commanderId) continue;
        const key = p.user_id;
        const cur = grouped.get(key);
        if (cur) {
          cur.quizCount++;
          cur.totalScore += p.score || 0;
        } else {
          grouped.set(key, { name: p.name || p.user_id.slice(0, 8), quizCount: 1, totalScore: p.score || 0 });
        }
      }
      setStudents(Array.from(grouped.entries()).map(([userId, s]) => ({ userId, ...s })).sort((a, b) => b.totalScore - a.totalScore));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [quizzes, commanderId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!students.length) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2.5">
        <Users className="w-5 h-5 text-primary" />
        <h2 className="text-section-title tracking-tight">Gladiator Activity</h2>
        <span className="text-sm text-muted-foreground ml-auto">{students.length} gladiator{students.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto rounded-[14px] border border-border/50">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/30 border-b border-border/50">
              <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs">Name</th>
              <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs">User ID</th>
              <th scope="col" className="text-center p-3 font-medium text-muted-foreground text-xs">Battles</th>
              <th scope="col" className="text-right p-3 font-medium text-muted-foreground text-xs">Total</th>
              <th scope="col" className="text-right p-3 font-medium text-muted-foreground text-xs">Avg</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => (
              <tr key={s.userId} className={cn("border-b border-border/30 transition-colors hover:bg-muted/20", i % 2 === 0 ? "bg-card" : "bg-muted/[0.03]")}>
                <td className="p-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">{s.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">{s.name}</span>
                  </div>
                </td>
                <td className="p-3 font-mono text-xs text-muted-foreground">{s.userId.slice(0, 12)}...</td>
                <td className="p-3 text-center"><Badge variant="secondary" className="h-6">{s.quizCount}</Badge></td>
                <td className="p-3 text-right font-semibold text-sm">{s.totalScore}</td>
                <td className="p-3 text-right text-muted-foreground text-sm">{s.quizCount ? Math.round(s.totalScore / s.quizCount) : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
