'use client';

import React, { useCallback, useEffect, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/hooks/useAuth';
import { useAnalytics } from '@/hooks/useAnalytics';
import { QuizOverviewCards } from './QuizOverviewCards';
import { StudentAnalyticsSection } from './StudentAnalyticsSection';
import { QuestionAnalyticsSection } from './QuestionAnalyticsSection';
import { QuizAnalyticsSection } from './QuizAnalyticsSection';
import { SystemInsightsSection } from './SystemInsightsSection';
import { CommanderPerformanceTable } from './CommanderPerformanceTable';
import { DifficultyCalibrationTable } from './DifficultyCalibrationTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingScreen } from '@/components/LoadingScreen';
import { RefreshCw, Download, FileText, BarChart3, TrendingUp, Users, MessageSquare, BrainCircuit, Swords } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { exportAnalyticsCSV, exportAnalyticsHTML, type ExportPreferences } from '@/services/analytics.service';
import { useFirebase } from '@/firebase';

interface AnalyticsChartData {
  dailyBattles: { date: string; value: number }[];
  weeklyBattles: { date: string; value: number }[];
  monthlyUsers: { date: string; value: number }[];
  commanderActivity: { name: string; value: number }[];
  gladiatorParticipation: { date: string; value: number }[];
  categoryUsage: { name: string; value: number }[];
  aiUsage: { date: string; value: number }[];
  messageActivity: { date: string; value: number }[];
  summary: {
    totalBattles: number;
    totalUsers: number;
    totalCommanders: number;
    totalGladiators: number;
    totalQuestions: number;
    totalConversations: number;
  };
}

const defaultExportPrefs: ExportPreferences = {
  includeStudentNames: true,
  includeScores: true,
  includeTimestamps: true,
};

const AnalyticsCharts = dynamic(
  () => import('./AnalyticsCharts').then(m => ({ default: m.AnalyticsCharts })),
  { ssr: false, loading: () => <LoadingScreen /> }
);

export function AnalyticsDashboard() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { data, isLoading, error, refetch } = useAnalytics(user?.id, user?.role);
  const [exportPrefs, setExportPrefs] = useState<ExportPreferences>(defaultExportPrefs);
  const [chartData, setChartData] = useState<AnalyticsChartData | null>(null);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [chartsError, setChartsError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== 'executive') return;
    auth.currentUser?.getIdToken()
      .then(token => {
        if (!token) return null;
        return fetch('/api/executive/settings', {
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .then(res => (res ? res.json() : null))
      .then(data => {
        if (data?.settings?.exportPreferences) {
          setExportPrefs(data.settings.exportPreferences);
        }
      })
      .catch(() => {});
  }, [user, auth]);

  const fetchCharts = useCallback(async () => {
    if (!user || user.role !== 'executive') return;
    try {
      setChartsLoading(true);
      setChartsError(null);
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setChartsError('You are not signed in.');
        return;
      }
      const res = await fetch('/api/executive/analytics-data', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setChartData(d);
      } else {
        const d = await res.json().catch(() => null);
        setChartsError(d?.error || 'Failed to load chart data.');
        setChartData(null);
      }
    } catch {
      setChartsError('Network error. Check your connection and try again.');
      setChartData(null);
    } finally {
      setChartsLoading(false);
    }
  }, [user, auth]);

  useEffect(() => {
    fetchCharts();
  }, [fetchCharts]);

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
    const csv = exportAnalyticsCSV(data, exportPrefs);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analytics-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportHTML = () => {
    const html = exportAnalyticsHTML(data, exportPrefs);
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

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="commander">Commander Performance</TabsTrigger>
          <TabsTrigger value="difficulty">Difficulty Calibration</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniChartStat icon={Swords} label="Total Battles" value={chartData?.summary.totalBattles ?? 0} />
            <MiniChartStat icon={Users} label="Total Users" value={chartData?.summary.totalUsers ?? 0} />
            <MiniChartStat icon={Users} label="Commanders" value={chartData?.summary.totalCommanders ?? 0} />
            <MiniChartStat icon={Users} label="Gladiators" value={chartData?.summary.totalGladiators ?? 0} />
            <MiniChartStat icon={BarChart3} label="Questions" value={chartData?.summary.totalQuestions ?? 0} />
            <MiniChartStat icon={MessageSquare} label="Conversations" value={chartData?.summary.totalConversations ?? 0} />
          </div>

          <Suspense fallback={<LoadingScreen />}>
            <AnalyticsCharts chartData={chartData} chartsLoading={chartsLoading} chartsError={chartsError} />
          </Suspense>

          <QuizOverviewCards overview={data.overview} />
          <SystemInsightsSection getToken={async () => auth.currentUser?.getIdToken() ?? null} />
          <StudentAnalyticsSection students={data.students} />
          <QuestionAnalyticsSection questions={data.questions} />
          <QuizAnalyticsSection quizzes={data.quizzes} />
        </TabsContent>

        <TabsContent value="commander" className="mt-6">
          <CommanderPerformanceTable />
        </TabsContent>

        <TabsContent value="difficulty" className="mt-6">
          <DifficultyCalibrationTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MiniChartStat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <div>
          <p className="text-lg font-bold leading-tight">{value}</p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
