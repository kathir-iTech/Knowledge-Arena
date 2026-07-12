'use client';

import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAnalytics } from '@/hooks/useAnalytics';
import { QuizOverviewCards } from './QuizOverviewCards';
import { StudentAnalyticsSection } from './StudentAnalyticsSection';
import { QuestionAnalyticsSection } from './QuestionAnalyticsSection';
import { QuizAnalyticsSection } from './QuizAnalyticsSection';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingScreen } from '@/components/LoadingScreen';
import { RefreshCw, Download, FileText } from 'lucide-react';
import { exportAnalyticsCSV, exportAnalyticsHTML } from '@/services/analytics.service';

export function AnalyticsDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useAnalytics(user?.id);

  if (isLoading) return <LoadingScreen />;

  if (error) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="py-8 text-center">
          <p className="text-red-500 mb-4" role="alert">{error}</p>
          <Button onClick={refetch} variant="outline"><RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" /> Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const handleExportCSV = () => {
    const csv = exportAnalyticsCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analytics-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportHTML = () => {
    const html = exportAnalyticsHTML(data);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analytics-report.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-2xl font-headline tracking-tight">Analytics Dashboard</h2>
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(data.fetchedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportCSV} variant="outline" size="sm" className="h-8 text-xs" aria-label="Export as CSV">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            CSV
          </Button>
          <Button onClick={handleExportHTML} variant="outline" size="sm" className="h-8 text-xs" aria-label="Export as HTML report">
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Report
          </Button>
          <Button onClick={refetch} variant="outline" size="sm" className="h-8 text-xs" aria-label="Refresh analytics data">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      <QuizOverviewCards overview={data.overview} />
      <StudentAnalyticsSection students={data.students} />
      <QuestionAnalyticsSection questions={data.questions} />
      <QuizAnalyticsSection quizzes={data.quizzes} />
    </div>
  );
}
