'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { participantService } from '@/services/participant.service';
import { History, Swords, ExternalLink, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export default function GladiatorHistoryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [history, setHistory] = useState<Array<{ quizId: string; title: string; score: number; status: string; created_at: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    participantService.getStudentHistory(user.id)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <LoadingScreen message="Loading battle history..." />;

  return (
    <div className="page-container safe-bottom safe-top animate-in">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.push('/gladiator/dashboard')} aria-label="Back to dashboard">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-page-title font-headline tracking-tight">Battle History</h1>
        <span className="text-sm text-muted-foreground ml-auto">{history.length} battle{history.length !== 1 ? 's' : ''}</span>
      </div>

      {history.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-border/50 rounded-[18px]">
          <Swords className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-base text-muted-foreground mb-4">No battles fought yet.</p>
          <Button asChild><Link href="/gladiator/dashboard">Join a Battle</Link></Button>
        </div>
      ) : (
        <div className="-mx-4 md:mx-0 overflow-x-auto rounded-none md:rounded-[14px] border-x-0 md:border border-border/50 mobile-hide-overflow">
          <table className="w-full text-sm min-w-[360px] md:min-w-0">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/30 border-b border-border/50">
                <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs">#</th>
                <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs">Title</th>
                <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Status</th>
                <th scope="col" className="text-left p-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Date</th>
                <th scope="col" className="text-right p-3 font-medium text-muted-foreground text-xs">Score</th>
                <th scope="col" className="text-center p-3 font-medium text-muted-foreground text-xs">Review</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, idx) => (
                <tr key={h.quizId} className={cn("border-b border-border/30 transition-colors hover:bg-muted/20", idx % 2 === 0 ? "bg-card" : "bg-muted/[0.03]")}>
                  <td className="p-3">
                    <span className="flex items-center justify-center w-8 h-8 rounded-[10px] bg-primary/10 text-primary font-mono text-xs font-bold">{idx + 1}</span>
                  </td>
                  <td className="p-3 font-medium text-sm min-w-0 max-w-[120px] md:max-w-none truncate">{h.title}</td>
                  <td className="p-3 hidden sm:table-cell">
                    <Badge variant={h.status === 'finished' ? 'outline' : h.status === 'live' ? 'default' : 'secondary'} className="h-6">
                      {h.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground whitespace-nowrap hidden sm:table-cell">{new Date(h.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <span className="font-semibold text-base text-primary">{h.score}</span>
                    <span className="text-xs text-muted-foreground ml-0.5">pts</span>
                  </td>
                  <td className="p-3 text-center">
                    {h.status === 'finished' ? (
                      <Button variant="ghost" size="icon" asChild aria-label={`View results for ${h.title}`}>
                        <Link href={`/battle/${h.quizId}`}><ExternalLink className="w-4 h-4" /></Link>
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">&mdash;</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
