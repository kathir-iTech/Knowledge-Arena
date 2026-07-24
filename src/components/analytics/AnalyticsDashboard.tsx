'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAnalytics } from '@/hooks/useAnalytics';
import { QuizOverviewCards } from './QuizOverviewCards';
import { StudentAnalyticsSection } from './StudentAnalyticsSection';
import { QuestionAnalyticsSection } from './QuestionAnalyticsSection';
import { QuizAnalyticsSection } from './QuizAnalyticsSection';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingScreen } from '@/components/LoadingScreen';
import { RefreshCw, Download, FileText, BarChart3, TrendingUp, Users, MessageSquare, BrainCircuit, Swords } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { exportAnalyticsCSV, exportAnalyticsHTML, type ExportPreferences } from '@/services/analytics.service';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { useFirebase } from '@/firebase';

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

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

export function AnalyticsDashboard() {
  const { user } = useAuth();
  const { auth } = useFirebase();
  const { data, isLoading, error, refetch } = useAnalytics(user?.id, user?.role);
  const [exportPrefs, setExportPrefs] = useState<ExportPreferences>(defaultExportPrefs);
  const [chartData, setChartData] = useState<AnalyticsChartData | null>(null);
  const [chartsLoading, setChartsLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'executive') return;
    fetch('/api/executive/settings', {
      headers: user ? { Authorization: `Bearer ${user.id}` } : {},
    })
      .then(res => res.json())
      .then(data => {
        if (data?.settings?.exportPreferences) {
          setExportPrefs(data.settings.exportPreferences);
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== 'executive') return;
    const fetchCharts = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch('/api/executive/analytics-data', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json();
          setChartData(d);
        }
      } catch {
        // silently fail
      } finally {
        setChartsLoading(false);
      }
    };
    fetchCharts();
  }, [user, auth]);

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

      {!chartsLoading && chartData && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniChartStat icon={Swords} label="Total Battles" value={chartData.summary.totalBattles} />
            <MiniChartStat icon={Users} label="Total Users" value={chartData.summary.totalUsers} />
            <MiniChartStat icon={Users} label="Commanders" value={chartData.summary.totalCommanders} />
            <MiniChartStat icon={Users} label="Gladiators" value={chartData.summary.totalGladiators} />
            <MiniChartStat icon={BarChart3} label="Questions" value={chartData.summary.totalQuestions} />
            <MiniChartStat icon={MessageSquare} label="Conversations" value={chartData.summary.totalConversations} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Daily Battles (30 days)" icon={<Swords className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData.dailyBattles}>
                  <defs><linearGradient id="db" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                  <Area type="monotone" dataKey="value" stroke="#6366f1" fill="url(#db)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Monthly Users (30 days)" icon={<Users className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData.monthlyUsers}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Commander Activity (Top 10)" icon={<TrendingUp className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData.commanderActivity} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Category Usage" icon={<BarChart3 className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={chartData.categoryUsage} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={false}>
                    {chartData.categoryUsage.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="AI Usage (30 days)" icon={<BrainCircuit className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData.aiUsage}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                  <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Message Activity (30 days)" icon={<MessageSquare className="w-4 h-4" />}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData.messageActivity}>
                  <defs><linearGradient id="ma" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/><stop offset="95%" stopColor="#ec4899" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                  <Area type="monotone" dataKey="value" stroke="#ec4899" fill="url(#ma)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}

      <QuizOverviewCards overview={data.overview} />
      <StudentAnalyticsSection students={data.students} />
      <QuestionAnalyticsSection questions={data.questions} />
      <QuizAnalyticsSection quizzes={data.quizzes} />
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

function ChartCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
