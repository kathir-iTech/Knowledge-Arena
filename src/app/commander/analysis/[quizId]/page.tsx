'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { PostBattleAnalysis } from '@/components/commander/PostBattleAnalysis';

export default function AnalysisPage() {
  const params = useParams() as { quizId: string };
  const router = useRouter();
  const quizId = params.quizId;

  if (!quizId) return null;

  return (
    <div className="page-container safe-top safe-bottom animate-in space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/commander/history')} aria-label="Back to history">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-page-title font-headline tracking-tight">Battle Analysis</h1>
        <span className="text-sm font-mono text-muted-foreground ml-auto">{quizId}</span>
      </div>
      <PostBattleAnalysis quizId={quizId} />
    </div>
  );
}
