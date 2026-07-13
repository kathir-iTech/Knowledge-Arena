'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Users, BarChart3, TrendingUp } from 'lucide-react';
import type { OverviewStats } from '@/services/analytics.service';

const cards = [
  { key: 'totalQuizzes', label: 'Total Quizzes', icon: BookOpen, color: 'text-primary' },
  { key: 'totalParticipants', label: 'Gladiators', icon: Users, color: 'text-primary' },
  { key: 'averageScore', label: 'Avg Score', icon: BarChart3, color: 'text-warning', suffix: '' },
  { key: 'completionRate', label: 'Completion Rate', icon: TrendingUp, color: 'text-success', suffix: '%' },
];

export function QuizOverviewCards({ overview }: { overview: OverviewStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(c => {
        const Icon = c.icon;
        let value: string | number = (overview as unknown as Record<string, number>)[c.key] ?? 0;
        if (typeof value === 'number') {
          if (c.key === 'completionRate' || c.key === 'averageParticipantsPerQuiz') {
            value = value.toFixed(1);
          } else {
            value = Math.round(value);
          }
        }
        return (
          <Card key={c.key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 px-5 pt-5">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <Icon className={`w-4 h-4 ${c.color}`} />
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="text-2xl font-semibold tracking-tight">{value}{c.suffix || ''}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
