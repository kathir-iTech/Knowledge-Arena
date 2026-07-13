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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { exportAnalyticsCSV, exportAnalyticsHTML } from '@/services/analytics.service';

export function AnalyticsDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useAnalytics(user?.id);

  if (isLoading) return <LoadingScreen />;

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-destructive mb-4 text-sm" role="alert">{error}</p>
          <Button onClick={refetch} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" /> Retry</Button>
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
    <div className="space-y-8 animate-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-headline tracking-tight">Analytics</h1>
          <p className="text-base text-muted-foreground">
            Last updated: {new Date(data.fetchedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={refetch} variant="outline" size="sm" aria-label="Refresh analytics data">
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Export options">
                <Download className="h-4 w-4 mr-1.5" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={handleExportCSV}>
                <Download className="w-4 h-4 mr-2" /> CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportHTML}>
                <FileText className="w-4 h-4 mr-2" /> Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <QuizOverviewCards overview={data.overview} />
      <StudentAnalyticsSection students={data.students} />
      <QuestionAnalyticsSection questions={data.questions} />
      <QuizAnalyticsSection quizzes={data.quizzes} />
    </div>
  );
}
