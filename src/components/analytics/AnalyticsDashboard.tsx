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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Last updated: {new Date(data.fetchedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportCSV} variant="outline" size="sm" aria-label="Export as CSV">
            <Download className="w-4 h-4 mr-2" aria-hidden="true" />
            CSV
          </Button>
          <Button onClick={handleExportHTML} variant="outline" size="sm" aria-label="Export as HTML report">
            <FileText className="w-4 h-4 mr-2" aria-hidden="true" />
            Report
          </Button>
          <Button onClick={refetch} variant="outline" size="sm" aria-label="Refresh analytics data">
            <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
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
