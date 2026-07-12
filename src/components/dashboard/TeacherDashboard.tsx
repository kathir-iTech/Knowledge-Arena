'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const AIInsightCards = dynamic(() => import('@/components/dashboard/AIInsightCards').then(m => m.AIInsightCards), { ssr: false });

import { PlusCircle, Loader2, Trash2, Users, RefreshCw, PlayCircle, Pencil, Copy, Archive, ArchiveRestore, Download, FileText, Search as SearchIcon, BarChart3, BookOpen, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { cn } from '@/lib/utils';
import { useFirebase } from '@/firebase';

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
  a.download = `quiz-${quiz.id}-results.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const QuizCard = ({ quiz, onUpdate }: { quiz: ValidatedQuiz; onUpdate: () => void }) => {
    const { toast } = useToast();
    const { auth } = useFirebase();
    const [isProcessing, setIsProcessing] = useState(false);
    const [participants, setParticipants] = useState<ValidatedParticipant[]>([]);

    useEffect(() => {
        const sub = participantService.subscribeToParticipants(quiz.id, setParticipants);
        return () => { sub(); };
    }, [quiz.id]);

    const handleResetStudent = async (sid: string) => {
        try {
            await participantService.unblockParticipant(quiz.id, sid);
            toast({ title: 'Student Reset', description: 'Malpractice block has been cleared.' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to reset student.' });
        }
    };

    const handleDelete = async () => {
        setIsProcessing(true);
        try {
            await quizService.deleteQuiz(quiz.id);
            toast({ title: 'Arena Purged', description: 'Quiz room and all data destroyed.' });
            onUpdate();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not delete quiz.' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleResetQuiz = async () => {
        setIsProcessing(true);
        try {
            await quizService.resetQuiz(quiz.id);
            toast({ title: 'Quiz Reset', description: 'Room returned to waiting state.' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not reset quiz.' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDuplicate = async () => {
      setIsProcessing(true);
      try {
        const newId = await quizService.duplicateQuiz(quiz.id, quiz.created_by);
        toast({ title: 'Quiz Duplicated', description: `New room code: ${newId}` });
        onUpdate();
      } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not duplicate quiz.' });
      } finally {
        setIsProcessing(false);
      }
    };

    const handleArchiveToggle = async () => {
      setIsProcessing(true);
      try {
        await quizService.updateQuiz(quiz.id, { archived: !quiz.archived });
        toast({ title: quiz.archived ? 'Quiz Restored' : 'Quiz Archived', description: quiz.archived ? 'Quiz is visible again.' : 'Quiz moved to archive.' });
        onUpdate();
      } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not update quiz.' });
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
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Quiz Results - ${escHtml(quiz.title)}</title><style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:auto}h1{font-size:24px;margin-bottom:4px}.sub{color:#666;margin-bottom:24px}table{width:100%;border-collapse:collapse}th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #ddd}th{background:#f5f5f5;font-size:12px;text-transform:uppercase;letter-spacing:0.5px}.rank{font-weight:bold;font-size:18px;color:#333}</style></head><body><h1>${escHtml(quiz.title)}</h1><p class="sub">Room: ${escHtml(quiz.id)} &mdash; ${sorted.length} gladiator(s)</p><table><thead><tr><th>Rank</th><th>Name</th><th>Score</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 500);
      }
    };

    const participantCount = participants?.filter(p => p.user_id !== quiz.created_by).length || 0;

    return (
        <Card className={cn(
          "transition-all duration-200 hover:shadow-elevation-hover",
          quiz.archived && "opacity-50"
        )}>
            <CardHeader className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 pb-3">
                <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-sm font-headline tracking-tight group-hover:text-primary transition-colors">
                        <Link href={`/battle/${quiz.id}`}>{quiz.title}</Link>
                      </CardTitle>
                      <span className="font-mono text-[11px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded-[4px]">{quiz.id}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn(
                            "text-[10px] font-medium h-5",
                            quiz.archived ? "bg-muted/50 text-muted-foreground" :
                            quiz.status === 'live' ? "bg-green-500/10 text-green-400 border-green-500/20" :
                            quiz.status === 'finished' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                            "bg-primary/10 text-primary border-primary/20"
                        )}>
                            {quiz.archived ? 'ARCHIVED' : quiz.status.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {participantCount} student{participantCount !== 1 ? 's' : ''}
                        </span>
                        {!!quiz.created_at && quiz.created_at > 0 && (
                          <span className="text-xs text-muted-foreground">{new Date(quiz.created_at).toLocaleDateString()}</span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1 flex-wrap shrink-0">
                    {!quiz.archived && (
                      <Button asChild size="sm" variant={quiz.status === 'waiting' ? 'default' : 'outline'} className="h-8 text-xs font-medium">
                          <Link href={`/battle/${quiz.id}`}>
                              {quiz.status === 'waiting' ? (
                                  <><PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Start</>
                              ) : 'Enter'}
                          </Link>
                      </Button>
                    )}

                    {!quiz.archived && quiz.status === 'waiting' && (
                      <Button variant="outline" size="icon" className="h-8 w-8" asChild aria-label="Edit quiz">
                        <Link href={`/teacher/edit-quiz/${quiz.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                      </Button>
                    )}

                    {!quiz.archived && (
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleDuplicate} disabled={isProcessing} aria-label="Duplicate quiz">
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    )}

                    {quiz.status === 'finished' && !quiz.archived && (
                      <>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleExportCSV} aria-label="Export results as CSV">
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleExportPDF} aria-label="Export results as PDF">
                          <FileText className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}

                    {quiz.status === 'finished' && !quiz.archived && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline" size="icon" className="h-8 w-8" disabled={isProcessing} aria-label="Reset quiz">
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Reset Quiz?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will purge all scores and student entries. The room will return to the 'Waiting' state.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Keep results</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleResetQuiz}>Reset Room</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}

                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleArchiveToggle} disabled={isProcessing} aria-label={quiz.archived ? 'Restore quiz' : 'Archive quiz'}>
                      {quiz.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                    </Button>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" className="h-8 w-8" disabled={isProcessing} aria-label="Delete quiz">
                                <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete Arena?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action is permanent. The quiz room and all gladiator history will be destroyed forever.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Destroy Forever</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardHeader>
            {participants && participants.some(p => p.status === 'blocked') && (
              <CardContent className="pt-0 pb-3 px-4">
                <div className="p-3 bg-destructive/5 rounded-[10px] border border-destructive/10 space-y-2">
                  <p className="text-[10px] font-bold text-destructive uppercase tracking-widest">Awaiting Amnesty (Blocked):</p>
                  {participants.filter(p => p.status === 'blocked').map(p => (
                    <div key={p.user_id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6"><AvatarFallback className="text-[10px]">🎮</AvatarFallback></Avatar>
                        <span className="text-sm">{p.user_id.slice(0, 12)}</span>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 px-3 text-xs text-destructive hover:bg-destructive/10" onClick={() => handleResetStudent(p.user_id)}>Unblock</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
        </Card>
    );
};

function OverviewCards({ quizzes, participants }: { quizzes: ValidatedQuiz[]; participants: ValidatedParticipant[] }) {
  const total = quizzes.filter(q => !q.archived).length;
  const running = quizzes.filter(q => q.status === 'live' && !q.archived).length;
  const uniqueStudents = new Set(participants.filter(p => p.status !== 'blocked').map(p => p.user_id)).size;
  const avgScore = participants.length > 0
    ? Math.round(participants.reduce((sum, p) => sum + (p.score || 0), 0) / participants.length)
    : 0;

  const cards = [
    { icon: BookOpen, label: 'Total Quizzes', value: total, color: 'text-primary' },
    { icon: TrendingUp, label: 'Running', value: running, color: 'text-green-400' },
    { icon: Users, label: 'Students', value: uniqueStudents, color: 'text-blue-400' },
    { icon: BarChart3, label: 'Avg Score', value: avgScore + '%', color: 'text-amber-400' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(card => (
        <Card key={card.label}>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <card.icon className={cn("w-4 h-4", card.color)} />
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <span className="text-2xl font-semibold tracking-tight">{card.value}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function TeacherDashboard() {
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
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 page-section">
        <div className="space-y-1">
          <h1 className="text-page-title font-headline tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome back, {user?.name || 'Commander'}.</p>
        </div>
        <Button asChild>
            <Link href="/create-quiz"><PlusCircle className="mr-2 h-4 w-4" />New Arena</Link>
        </Button>
      </header>

      <div className="page-section">
        <OverviewCards quizzes={quizzes} participants={allParticipants} />
      </div>

      <div className="page-section">
        <Suspense fallback={<div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div className="h-32 bg-secondary/10 rounded-[10px] animate-pulse" /><div className="h-32 bg-secondary/10 rounded-[10px] animate-pulse" /><div className="h-32 bg-secondary/10 rounded-[10px] animate-pulse" /></div>}>
          <AIInsightCards />
        </Suspense>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center page-section">
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name or room code..."
            className="pl-9"
            aria-label="Search arenas"
          />
        </div>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="h-10 rounded-[10px] border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Sort quizzes"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="title">By Title</option>
          <option value="status">By Status</option>
        </select>
        <div className="flex gap-1 flex-wrap">
          {[
            { key: 'all', label: 'Active' },
            { key: 'active', label: 'Running' },
            { key: 'completed', label: 'Completed' },
            { key: 'draft', label: 'Draft' },
            { key: 'archived', label: 'Archived' }
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterKey(key as FilterKey)}
              className={cn(
                "px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all duration-150",
                filterKey === key ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
              aria-pressed={filterKey === key}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filteredAndSorted.map(q => <QuizCard key={q.id} quiz={q} onUpdate={fetchQuizzes} />)}
        {filteredAndSorted.length === 0 && (
            <div className="py-12 text-center border-2 border-dashed border-muted/30 rounded-[14px]">
                <p className="text-muted-foreground mb-4">
                  {searchQuery ? 'No arenas match your search.' : filterKey === 'archived' ? 'No archived arenas.' : filterKey === 'draft' ? 'No draft quizzes.' : filterKey === 'completed' ? 'No completed quizzes.' : filterKey === 'active' ? 'No active quizzes.' : 'No arenas have been constructed yet.'}
                </p>
                {!searchQuery && (
                  <Button asChild variant="outline"><Link href="/create-quiz">Create Your First Quiz</Link></Button>
                )}
            </div>
        )}
      </div>

      <div className="mt-8">
        <StudentActivity quizzes={quizzes} teacherId={user?.id} />
      </div>
    </div>
  );
}

function StudentActivity({ quizzes, teacherId }: { quizzes: ValidatedQuiz[]; teacherId?: string }) {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!quizzes.length || !teacherId) { setLoading(false); return; }
    let cancelled = false;
    participantService.getAllParticipantsBulk(quizzes.map(q => q.id)).then(all => {
      if (cancelled) return;
      const grouped = new Map<string, { name: string; quizCount: number; totalScore: number }>();
      for (const p of all) {
        if (p.user_id === teacherId) continue;
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
  }, [quizzes, teacherId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!students.length) return null;

  return (
    <section className="space-y-4 page-section">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" />
        <h2 className="text-section-title tracking-tight">Student Activity</h2>
        <span className="text-xs text-muted-foreground ml-auto">{students.length} student{students.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto rounded-[10px] border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b">
              <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Name</th>
              <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">User ID</th>
              <th scope="col" className="text-center p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Battles</th>
              <th scope="col" className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Total</th>
              <th scope="col" className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Avg</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => (
              <tr key={s.userId} className={cn("border-b border-border/40 transition-colors hover:bg-muted/20", i % 2 === 0 ? "bg-background" : "bg-muted/[0.03]")}>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">{s.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">{s.name}</span>
                  </div>
                </td>
                <td className="p-3 font-mono text-xs text-muted-foreground">{s.userId.slice(0, 12)}...</td>
                <td className="p-3 text-center"><Badge variant="secondary" className="text-[10px] h-5">{s.quizCount}</Badge></td>
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

interface StudentSummary {
  userId: string;
  name: string;
  quizCount: number;
  totalScore: number;
}
