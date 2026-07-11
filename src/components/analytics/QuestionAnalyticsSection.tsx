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

const PIE_COLORS = ['#22c55e', '#ef4444', '#6b7280'];

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
        <CardHeader><CardTitle>Question Analytics</CardTitle></CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground">No question data yet.</CardContent>
      </Card>
    );
  }

  const hardest = useMemo(() => [...questions].sort((a, b) => a.correctPercent - b.correctPercent).slice(0, 5), [questions]);
  const easiest = useMemo(() => [...questions].sort((a, b) => b.correctPercent - a.correctPercent).slice(0, 5), [questions]);

  return (
    <div className="space-y-6 mb-8">
      <Card>
        <CardHeader>
          <CardTitle>Question Analytics</CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search questions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 max-w-xs"
              aria-label="Search questions"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card className="bg-red-500/5 border-red-500/20">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" aria-hidden="true" /> Hardest Questions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {hardest.map((q, i) => (
                  <div key={q.questionId} className="flex items-center justify-between text-sm">
                    <span className="truncate mr-2">{i + 1}. {q.text}</span>
                    <Badge variant="destructive" className="shrink-0">{q.correctPercent}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="bg-green-500/5 border-green-500/20">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-green-500" aria-hidden="true" /> Easiest Questions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {easiest.map((q, i) => (
                  <div key={q.questionId} className="flex items-center justify-between text-sm">
                    <span className="truncate mr-2">{i + 1}. {q.text}</span>
                    <Badge className="bg-green-500/10 text-green-600 border-0 shrink-0">{q.correctPercent}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="border-b">
                  <th scope="col" className="text-left py-2 px-3 font-medium text-muted-foreground">Question</th>
                  <th scope="col" className="text-left py-2 px-3 font-medium text-muted-foreground">Quiz</th>
                  <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">Correct</th>
                  <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">Wrong</th>
                  <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">Skipped</th>
                  <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">Avg Time</th>
                  <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">Submissions</th>
                  <th scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(q => {
                  const common = q.commonWrongAnswer;
                  return (
                    <tr key={q.questionId} className={cn('border-b last:border-0 hover:bg-muted/50 transition-colors', selected === q.questionId && 'bg-muted/30')}>
                      <td className="py-2 px-3 max-w-[200px] truncate font-medium">{q.text}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{q.quizTitle}</td>
                      <td className="text-center py-2 px-3">
                        <Badge className="bg-green-500/10 text-green-600 border-0">{q.correctPercent}%</Badge>
                      </td>
                      <td className="text-center py-2 px-3 text-red-600">{q.wrongPercent}%</td>
                      <td className="text-center py-2 px-3 text-muted-foreground">{q.skippedPercent}%</td>
                      <td className="text-center py-2 px-3">
                        <span className="text-xs flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          {q.averageResponseTime}s
                        </span>
                      </td>
                      <td className="text-center py-2 px-3">{q.totalSubmissions}</td>
                      <td className="text-center py-2 px-3">
                        <button
                          onClick={() => setSelected(selected === q.questionId ? null : q.questionId)}
                          className="text-xs text-primary hover:underline"
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
        <Card className="border-primary/30">
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
                    <Badge variant={opt.isCorrect ? 'default' : 'outline'} className={cn(opt.isCorrect && 'bg-green-500')}>
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
                  <div className="mt-4 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                    <p className="text-xs font-medium text-amber-600 flex items-center gap-1 mb-1">
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
