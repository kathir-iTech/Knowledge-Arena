'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useFirebase } from '@/firebase';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { quizService } from '@/services/quiz.service';
import { participantService } from '@/services/participant.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageError } from '@/components/ui/page-error';
import {
  PlusCircle, Swords, Search as SearchIcon, MoreHorizontal, Pencil, Copy,
  Trash2, Download, FileText, RefreshCw, Users, PlayCircle, Calendar,
  Shield, HelpCircle, Bell, Inbox, Star, TrendingUp, Clock, MessageSquare,
  BookOpen, Zap, ChevronRight, FlaskConical,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useRouter } from 'next/navigation';

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

interface DashboardData {
  totalBattles: number;
  activeBattles: Array<{ id: string; title: string; participantCount: number; createdAt: number }>;
  upcomingBattles: Array<{ id: string; title: string; participantCount: number; createdAt: number }>;
  recentBattles: Array<{ id: string; title: string; participantCount: number; winnerName: string | null; createdAt: number; score: number }>;
  stats: { totalBattles: number; activeCount: number; completedCount: number; totalParticipants: number; averageScore: number };
  pendingRequestsCount: number;
}

const QuizCard = ({ quiz, onUpdate }: { quiz: ValidatedQuiz; onUpdate: () => void }) => {
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);
    const [isExporting, setIsExporting] = useState<'csv' | 'pdf' | null>(null);
    const [participants, setParticipants] = useState<ValidatedParticipant[]>([]);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showReplayDialog, setShowReplayDialog] = useState(false);

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

    const handleReplay = async () => {
      if (isProcessing) return;
      setIsProcessing(true);
      try {
        const newId = await quizService.replayQuiz(quiz.id, quiz.created_by);
        toast({ title: 'Replay Arena Created', description: `New room code: ${newId}. Previous results remain intact.` });
        onUpdate();
      } catch {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not prepare the arena for replay.' });
      } finally {
        setIsProcessing(false);
        setShowReplayDialog(false);
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
    const isStaleLive = quiz.status === 'live' && quiz.created_at && Date.now() - quiz.created_at > 3600000;
    const isStaleWaiting = quiz.status === 'waiting' && quiz.created_at && Date.now() - quiz.created_at > 7200000;

    return (
        <Card className={cn("transition-all duration-200 overflow-hidden", quiz.archived && "opacity-50")}>
            <div className="relative">
              <div className={cn("absolute top-0 left-0 w-1 h-full",
                quiz.status === 'live' ? (isStaleLive ? "bg-warning" : "bg-success") :
                quiz.status === 'finished' ? "bg-primary" :
                quiz.archived ? "bg-muted" : (isStaleWaiting ? "bg-muted" : "bg-warning")
              )} />
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xl md:text-2xl font-headline font-bold tracking-tight truncate">
                        {quiz.title}
                      </span>
                      <Badge className={cn("shrink-0 h-7 px-3 text-xs font-semibold",
                          quiz.archived ? "bg-muted/50 text-muted-foreground" :
                          isStaleLive ? "bg-warning/10 text-warning border border-warning/20" :
                          quiz.status === 'live' ? "bg-success/10 text-success border border-success/20" :
                          quiz.status === 'finished' ? "bg-primary/10 text-primary border border-primary/20" :
                          isStaleWaiting ? "bg-muted/50 text-muted-foreground" :
                          "bg-warning/10 text-warning border border-warning/20"
                      )}>
                          <Shield className="w-3 h-3 mr-1" />
                          {isStaleLive ? 'STALLED' : quiz.archived ? 'Archived' : quiz.status === 'live' ? 'LIVE' : quiz.status === 'finished' ? 'Completed' : isStaleWaiting ? 'Abandoned' : 'Waiting'}
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
                            {quiz.status === 'waiting' ? <><Swords className="mr-2 h-4 w-4" /> Start Battle</> : <><PlayCircle className="mr-2 h-4 w-4" /> Enter Arena</>}
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
                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setShowReplayDialog(true); }} disabled={isProcessing}>
                              <RefreshCw className="w-4 h-4 mr-2" /> Replay Arena
                            </DropdownMenuItem>
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
            <AlertDialog open={showReplayDialog} onOpenChange={(open) => { if (!isProcessing) setShowReplayDialog(open); }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Replay Arena?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This creates a fresh room with the same questions and answer keys. The completed arena and its results will remain in your history.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isProcessing}>Keep Results</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReplay} disabled={isProcessing}>
                    {isProcessing ? 'Preparing...' : 'Replay Arena'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
  const { auth } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<ValidatedQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchQuizzes = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    quizService.getQuizzesByCreator(user.id)
      .then(setQuizzes)
      .catch(() => setError('Failed to load arenas. Please try again.'))
      .finally(() => setLoading(false));
  }, [user]);

  const fetchDashboardData = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/commander/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
      }
    } catch {}
  }, [auth]);

  useEffect(() => { fetchQuizzes(); fetchDashboardData(); }, [fetchQuizzes, fetchDashboardData]);

  const filteredAndSorted = useMemo(() => {
    let result = [...quizzes];
    if (filterKey === 'archived') result = result.filter(q => q.archived);
    else if (filterKey === 'active') result = result.filter(q => !q.archived && (q.status === 'waiting' || q.status === 'live'));
    else if (filterKey === 'completed') result = result.filter(q => !q.archived && q.status === 'finished');
    else if (filterKey === 'draft') result = result.filter(q => !q.archived && q.status === 'waiting');
    else result = result.filter(q => !q.archived);
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.trim().toLowerCase();
      result = result.filter(quiz => quiz.title.toLowerCase().includes(q) || quiz.id.toLowerCase().includes(q));
    }
    if (sortKey === 'newest') result.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    else if (sortKey === 'oldest') result.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    else if (sortKey === 'title') result.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortKey === 'status') result.sort((a, b) => a.status.localeCompare(b.status));
    return result;
  }, [quizzes, debouncedQuery, sortKey, filterKey]);

  if (loading) return <LoadingScreen message="Loading arenas..." />;

  const quickActions = [
    { label: 'Create Arena', icon: PlusCircle, href: '/create-quiz', color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/20' },
    { label: 'Question Bank', icon: BookOpen, href: '/create-quiz?tab=bank', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20' },
    { label: 'AI Import', icon: Zap, href: '/create-quiz?tab=forge', color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/20' },
    { label: 'My Requests', icon: Inbox, href: '/commander/requests', color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/20' },
    { label: 'Messages', icon: MessageSquare, href: '/commander/messages', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/20' },
    { label: 'Battle History', icon: Clock, href: '/commander/history', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20' },
  ];

  const liveBattles = quizzes.filter(q => q.status === 'live' && !q.archived);
  const waitingBattles = quizzes.filter(q => q.status === 'waiting' && !q.archived);
  const finishedBattles = quizzes.filter(q => q.status === 'finished' && !q.archived);

  return (
    <div className="page-container safe-bottom animate-in">
      {/* Header */}
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

      {/* Error State */}
      {error && (
        <section className="page-section">
          <PageError title={error} onRetry={() => { setError(null); fetchQuizzes(); }} />
        </section>
      )}

      {/* Quick Actions */}
      <section className="page-section">
        <div className="flex flex-wrap gap-2">
          {quickActions.map(action => (
            <button
              key={action.label}
              onClick={() => router.push(action.href)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] border border-border hover:border-primary/30 hover:bg-accent/30 transition-colors text-sm font-medium"
            >
              <div className={cn('w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0', action.color)}>
                <action.icon className="w-3.5 h-3.5" />
              </div>
              {action.label}
            </button>
          ))}
        </div>
      </section>

      {/* Stats Row */}
      {dashboardData && (
        <section className="page-section">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Swords} label="Total Battles" value={dashboardData.stats.totalBattles} color="text-blue-600" />
            <StatCard icon={PlayCircle} label="Active" value={dashboardData.stats.activeCount} color="text-emerald-600" />
            <StatCard icon={Users} label="Participants" value={dashboardData.stats.totalParticipants} color="text-amber-600" />
            <StatCard icon={Star} label="Avg Score" value={dashboardData.stats.averageScore} color="text-purple-600" />
          </div>
        </section>
      )}

      {/* Active + Upcoming Battles */}
      <div className="page-section grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Battles */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              Active Battles
            </CardTitle>
          </CardHeader>
          <CardContent>
            {liveBattles.length > 0 ? (
              <div className="space-y-2">
                {liveBattles.map(q => (
                  <Link key={q.id} href={`/battle/${q.id}`} className="block p-3 rounded-[10px] bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{q.title}</p>
                        <p className="text-xs text-muted-foreground">{q.id} · live</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600">LIVE</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={Swords} title="No Active Battles" description="Start an arena to see live action here." />
            )}
          </CardContent>
        </Card>

        {/* Upcoming Battles */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Upcoming Battles
            </CardTitle>
          </CardHeader>
          <CardContent>
            {waitingBattles.length > 0 ? (
              <div className="space-y-2">
                {waitingBattles.slice(0, 5).map(q => (
                  <Link key={q.id} href={`/battle/${q.id}`} className="block p-3 rounded-[10px] bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{q.title}</p>
                        <p className="text-xs text-muted-foreground">{q.id} · waiting</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">WAITING</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={Clock} title="No Upcoming Battles" description="Create an arena and set it to waiting mode." />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Battles + Pending Requests + Notifications */}
      <div className="page-section grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Battles */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Recent Battles
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push('/commander/history')}>
              View All <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {finishedBattles.length > 0 ? (
              <div className="space-y-1">
                {finishedBattles.slice(0, 5).map(q => (
                  <Link key={q.id} href={`/battle/${q.id}`} className="flex items-center justify-between p-2.5 rounded-[8px] hover:bg-muted/30 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{q.title}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(q.created_at || 0).toLocaleDateString()}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0 ml-2">DONE</Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={TrendingUp} title="No Completed Battles" description="Completed battles will appear here." />
            )}
          </CardContent>
        </Card>

        {/* Pending Requests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="w-4 h-4" />
              Pending Requests
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push('/commander/requests')}>
              View All <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {dashboardData && dashboardData.pendingRequestsCount > 0 ? (
              <div className="p-3 rounded-[10px] bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 flex items-center gap-3">
                <Inbox className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{dashboardData.pendingRequestsCount} pending request{dashboardData.pendingRequestsCount !== 1 ? 's' : ''}</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">Awaiting executive review</p>
                </div>
              </div>
            ) : (
              <EmptyState icon={Inbox} title="No Pending Requests" description="Requests you submit will appear here." />
            )}
          </CardContent>
        </Card>

        {/* Messages */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Messages
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push('/commander/messages')}>
              View All <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <EmptyState icon={MessageSquare} title="Check Messages" description="Stay in touch with your executive." action={<Button size="sm" variant="outline" onClick={() => router.push('/commander/messages')}>Open Messages</Button>} />
          </CardContent>
        </Card>
      </div>

      {/* Arena Library */}
      <section className="page-section">
        <div className="flex items-center gap-2.5 mb-4">
          <Swords className="w-5 h-5 text-primary" />
          <h2 className="text-section-title tracking-tight">Arena Library</h2>
          <span className="text-sm text-muted-foreground ml-auto">{filteredAndSorted.length} arena{filteredAndSorted.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center mb-6">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search arenas by name or room code..." className="pl-10 h-11" aria-label="Search arenas" />
          </div>
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} className="h-11 rounded-[12px] border border-input bg-background px-4 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Sort quizzes">
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
              <button key={key} onClick={() => setFilterKey(key as FilterKey)}
                className={cn("px-3.5 py-1.5 rounded-[10px] text-xs font-medium transition-all duration-150",
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
                {debouncedQuery ? 'No arenas match your search.' : 'No arenas have been created yet.'}
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

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0", color ? `${color.replace('text-', 'bg-').replace('600', '100')} dark:${color.replace('text-', 'bg-').replace('600', '950/20')}` : 'bg-muted')}>
          <Icon className={cn("w-4 h-4", color || 'text-muted-foreground')} />
        </div>
        <div>
          <p className="text-lg font-bold leading-tight">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
