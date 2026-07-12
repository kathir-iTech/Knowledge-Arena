'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Clock, Brain, AlertTriangle, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuestionAnalytics } from '@/services/analytics.service';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from './charts';

const PIE_COLORS = ['hsl(var(--success))', 'hsl(var(--destructive))', 'hsl(var(--muted-foreground))'];

export function QuestionAnalyticsSection({ questions }: { questions: QuestionAnalytics[] }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return questions;
    const q = search.toLowerCase();
    return questions.filter(qs => qs.text.toLowerCase().includes(q) || qs.quizTitle.toLowerCase().includes(q));
  }, [questions, search]);

  const selectedQ = selected ? questions.find(q => q.questionId === selected) : null;

  if (!questions.length) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Question Analytics</CardTitle></CardHeader>
        <CardContent className="text-center py-12 text-muted-foreground">No question data yet.</CardContent>
      </Card>
    );
  }

  const hardest = useMemo(() => [...questions].sort((a, b) => a.correctPercent - b.correctPercent).slice(0, 5), [questions]);
  const easiest = useMemo(() => [...questions].sort((a, b) => b.correctPercent - a.correctPercent).slice(0, 5), [questions]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Question Analytics</CardTitle>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search questions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 max-w-xs"
              aria-label="Search questions"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-destructive/5 border border-destructive/10 rounded-[14px] p-5 space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2 text-destructive"><AlertTriangle className="w-4 h-4" aria-hidden="true" /> Hardest Questions</h4>
              {hardest.map((q, i) => (
                <div key={q.questionId} className="flex items-center justify-between text-sm">
                  <span className="truncate mr-2">{i + 1}. {q.text}</span>
                  <Badge variant="destructive" className="shrink-0">{q.correctPercent}%</Badge>
                </div>
              ))}
            </div>
            <div className="bg-success/5 border border-success/10 rounded-[14px] p-5 space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2 text-success"><Target className="w-4 h-4" aria-hidden="true" /> Easiest Questions</h4>
              {easiest.map((q, i) => (
                <div key={q.questionId} className="flex items-center justify-between text-sm">
                  <span className="truncate mr-2">{i + 1}. {q.text}</span>
                  <Badge className="bg-success/10 text-success border-0 shrink-0">{q.correctPercent}%</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-[12px] border border-border/50">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="bg-muted/30 border-b border-border/50">
                  <th scope="col" className="text-left py-3 px-4 font-medium text-muted-foreground text-xs">Question</th>
                  <th scope="col" className="text-left py-3 px-4 font-medium text-muted-foreground text-xs">Quiz</th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Correct</th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Wrong</th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Skipped</th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Avg Time</th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Submissions</th>
                  <th scope="col" className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(q => {
                  return (
                    <tr key={q.questionId} className={cn('border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors', selected === q.questionId && 'bg-muted/30')}>
                      <td className="py-3 px-4 max-w-[200px] truncate font-medium text-sm">{q.text}</td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">{q.quizTitle}</td>
                      <td className="text-center py-3 px-4">
                        <Badge className="bg-success/10 text-success border-0 font-mono">{q.correctPercent}%</Badge>
                      </td>
                      <td className="text-center py-3 px-4 text-destructive text-sm">{q.wrongPercent}%</td>
                      <td className="text-center py-3 px-4 text-muted-foreground text-sm">{q.skippedPercent}%</td>
                      <td className="text-center py-3 px-4">
                        <span className="text-xs flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          {q.averageResponseTime}s
                        </span>
                      </td>
                      <td className="text-center py-3 px-4 text-sm">{q.totalSubmissions}</td>
                      <td className="text-center py-3 px-4">
                        <button
                          onClick={() => setSelected(selected === q.questionId ? null : q.questionId)}
                          className="text-sm text-primary hover:underline"
                          aria-label={`View detail for question: ${q.text}`}
                        >
                          {selected === q.questionId ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedQ && (
        <Card className="border-primary/20">
          <CardHeader><CardTitle className="text-base">{selectedQ.text}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="h-64">
                <p className="text-sm font-medium text-muted-foreground mb-2">Response Distribution</p>
                {selectedQ.totalSubmissions > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[
                      { name: 'Correct', value: Math.max(0, Math.round(selectedQ.correctPercent / 100 * selectedQ.totalSubmissions)) },
                      { name: 'Wrong', value: Math.max(0, Math.round(selectedQ.wrongPercent / 100 * selectedQ.totalSubmissions)) },
                      { name: 'Skipped', value: Math.max(0, Math.round(selectedQ.skippedPercent / 100 * selectedQ.totalSubmissions)) },
                    ]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {PIE_COLORS.map(c => <Cell key={c} fill={c} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No submissions yet.</div>
                )}
              </div>
              <div className="space-y-4">
                <p className="text-sm font-medium text-muted-foreground">Option Distribution</p>
                {selectedQ.optionDistribution.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Badge variant={opt.isCorrect ? 'default' : 'outline'} className={cn(opt.isCorrect && 'bg-success/10 text-success border-0')}>
                      {String.fromCharCode(65 + i)}
                    </Badge>
                    <div className="flex-1">
                      <div className="text-sm truncate">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.count} responses</div>
                    </div>
                    <div className="text-sm font-mono">{opt.count > 0 ? Math.round(opt.count / selectedQ.totalSubmissions * 100) : 0}%</div>
                  </div>
                ))}
                {selectedQ.commonWrongAnswer && (
                  <div className="mt-4 p-4 bg-warning/5 rounded-[12px] border border-warning/10">
                    <p className="text-xs font-medium text-warning flex items-center gap-1.5 mb-1.5">
                      <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                      Common Wrong Answer
                    </p>
                    <p className="text-sm">{selectedQ.commonWrongAnswer.option}</p>
                    <p className="text-xs text-muted-foreground">{selectedQ.commonWrongAnswer.count} students chose this</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
