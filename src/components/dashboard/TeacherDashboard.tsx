'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AIInsightCards } from '@/components/dashboard/AIInsightCards';
import { PlusCircle, Loader2, Trash2, Users, RefreshCw, PlayCircle, Pencil, Copy, Archive, ArchiveRestore, Download, FileText, Search as SearchIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { cn } from '@/lib/utils';
import { useFirebase } from '@/firebase';

type SortKey = 'newest' | 'oldest' | 'title' | 'status';
type FilterKey = 'all' | 'active' | 'completed' | 'draft' | 'archived';

function exportQuizCSV(quiz: ValidatedQuiz, participants: ValidatedParticipant[]) {
  const sorted = [...participants].sort((a, b) => b.score - a.score);
  const rows = [['Rank', 'User ID', 'Name', 'Score', 'Status']];
  sorted.forEach((p, i) => {
    rows.push([String(i + 1), p.user_id, p.name || p.user_id.slice(0, 8), String(p.score), p.status]);
  });
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
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
            await participantService.clearAllStudents(quiz.id);
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

    const handleExportPDF = () => {
      const sorted = [...participants].sort((a, b) => b.score - a.score);
      const rows = sorted.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name || p.user_id.slice(0, 8)}</td><td>${p.score}</td><td>${p.status}</td></tr>`).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Quiz Results - ${quiz.title}</title><style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:auto}h1{font-size:24px;margin-bottom:4px}.sub{color:#666;margin-bottom:24px}table{width:100%;border-collapse:collapse}th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #ddd}th{background:#f5f5f5;font-size:12px;text-transform:uppercase;letter-spacing:0.5px}.rank{font-weight:bold;font-size:18px;color:#333}</style></head><body><h1>${quiz.title}</h1><p class="sub">Room: ${quiz.id} &mdash; ${participants.length} gladiator(s)</p><table><thead><tr><th>Rank</th><th>Name</th><th>Score</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 500);
      }
    };

    return (
        <Card className={cn("bg-secondary/10 border-primary/20 shadow-md", quiz.archived && "opacity-60")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                    <CardTitle className="text-xl hover:text-primary transition-colors">
                        <Link href={`/battle/${quiz.id}`}>{quiz.title}</Link>
                    </CardTitle>
                    <div className="flex gap-2 items-center">
                        <Badge variant="outline" className="font-mono bg-background">{quiz.id}</Badge>
                        <Badge className={cn(
                            quiz.archived ? "bg-muted text-muted-foreground" :
                            quiz.status === 'live' ? "bg-green-500/10 text-green-500 border-green-500/20" : 
                            quiz.status === 'finished' ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary border-primary/20"
                        )}>
                            {quiz.archived ? 'ARCHIVED' : quiz.status.toUpperCase()}
                        </Badge>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {participants?.length || 0}
                        </span>
                    </div>
                </div>
                <div className="flex gap-2">
                    {!quiz.archived && (
                      <Button asChild size="sm" variant={quiz.status === 'waiting' ? 'default' : 'outline'}>
                          <Link href={`/battle/${quiz.id}`}>
                              {quiz.status === 'waiting' ? (
                                  <><PlayCircle className="mr-2 h-4 w-4" /> Start Battle</>
                              ) : 'Enter Arena'}
                          </Link>
                      </Button>
                    )}

                    {!quiz.archived && quiz.status === 'waiting' && (
                      <Button variant="outline" size="icon" className="max-sm:min-h-[44px] max-sm:min-w-[44px]" asChild>
                        <Link href={`/teacher/edit-quiz/${quiz.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Link>
                      </Button>
                    )}

                    {!quiz.archived && (
                      <Button variant="outline" size="icon" className="max-sm:min-h-[44px] max-sm:min-w-[44px]" onClick={handleDuplicate} disabled={isProcessing}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    )}

                    {quiz.status === 'finished' && !quiz.archived && (
                      <>
                        <Button variant="outline" size="icon" className="max-sm:min-h-[44px] max-sm:min-w-[44px]" onClick={handleExportCSV}>
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="max-sm:min-h-[44px] max-sm:min-w-[44px]" onClick={handleExportPDF}>
                          <FileText className="w-4 h-4" />
                        </Button>
                      </>
                    )}

                    {quiz.status === 'finished' && !quiz.archived && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline" size="icon" className="max-sm:min-h-[44px] max-sm:min-w-[44px]" disabled={isProcessing}>
                                    <RefreshCw className="w-4 h-4" />
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

                    <Button variant="outline" size="icon" className="max-sm:min-h-[44px] max-sm:min-w-[44px]" onClick={handleArchiveToggle} disabled={isProcessing}>
                      {quiz.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    </Button>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" className="max-sm:min-h-[44px] max-sm:min-w-[44px]" disabled={isProcessing}>
                                <Trash2 className="w-4 h-4" />
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
              <CardContent className="pt-2">
                <div className="space-y-2 p-3 bg-destructive/5 rounded-lg border border-destructive/10">
                  <p className="text-[10px] font-black text-destructive uppercase tracking-widest">Awaiting Amnesty (Blocked):</p>
                  {participants.filter(p => p.status === 'blocked').map(p => (
                    <div key={p.user_id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6"><AvatarFallback className="text-[10px]">🎮</AvatarFallback></Avatar>
                        <span className="text-sm font-medium">{p.user_id.slice(0, 12)}</span>
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

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<ValidatedQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');

  const fetchQuizzes = useCallback(() => {
    if (!user) return;
    quizService.getQuizzesByCreator(user.id)
      .then(setQuizzes)
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

  if (loading) return <div className="p-8 flex flex-col justify-center h-[50vh] items-center gap-4"><Loader2 className="animate-spin h-12 w-12 text-primary" /><p className="text-muted-foreground animate-pulse">Loading arenas...</p></div>;

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-6xl mx-auto safe-bottom">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-headline text-primary">Commander's Dashboard</h1>
          <p className="text-muted-foreground">Manage your battle rooms and review gladiator performance.</p>
        </div>
        <Button asChild size="lg" className="h-14 px-8 shadow-lg shadow-primary/20">
            <Link href="/create-quiz"><PlusCircle className="mr-2 h-5 w-5" />Construct New Arena</Link>
        </Button>
      </header>

      <AIInsightCards />

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search arenas..."
            className="pl-9 h-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['all', 'active', 'completed', 'draft', 'archived'] as FilterKey[]).map(key => (
          <button
            key={key}
            onClick={() => setFilterKey(key)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-medium transition-all uppercase tracking-wider",
              filterKey === key ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
            )}
          >
            {key === 'all' ? 'Active' : key}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredAndSorted.map(q => <QuizCard key={q.id} quiz={q} onUpdate={fetchQuizzes} />)}
        {filteredAndSorted.length === 0 && (
            <div className="md:col-span-2 py-20 text-center border-2 border-dashed border-muted rounded-3xl">
                <p className="text-muted-foreground text-lg mb-4">
                  {searchQuery ? 'No arenas match your search.' : filterKey === 'archived' ? 'No archived arenas.' : filterKey === 'draft' ? 'No draft quizzes.' : filterKey === 'completed' ? 'No completed quizzes.' : filterKey === 'active' ? 'No active quizzes.' : 'No arenas have been constructed yet.'}
                </p>
                {!searchQuery && (
                  <Button asChild variant="outline"><Link href="/create-quiz">Create Your First Quiz</Link></Button>
                )}
            </div>
        )}
      </div>
    </div>
  );
}
