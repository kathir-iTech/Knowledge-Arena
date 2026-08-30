'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';

interface PostBattleChartsProps {
  questionChartData: Array<{
    name: string;
    correct: number;
    incorrect: number;
    avgTime: number;
  }>;
  engagementChartData: Array<Record<string, string | number>>;
  engagement: Array<{
    gladiatorId: string;
    name: string;
    progression: number[];
    total: number;
  }>;
  colors: string[];
}

export function PostBattleCharts({ questionChartData, engagementChartData, engagement, colors }: PostBattleChartsProps) {
  return (
    <div className="space-y-6">
      {/* Question-by-question breakdown chart */}
      <div className="card-hover p-6 bg-background border border-border/30 rounded-xl">
        <h3 className="text-sm font-medium flex items-center gap-2 mb-4">
          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          Question Breakdown
        </h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={questionChartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <Bar dataKey="correct" fill="#10b981" name="Correct" radius={[4, 4, 0, 0]} />
              <Bar dataKey="incorrect" fill="#ef4444" name="Incorrect" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gladiator engagement chart */}
      <div className="card-hover p-6 bg-background border border-border/30 rounded-xl">
        <h3 className="text-sm font-medium flex items-center gap-2 mb-4">
          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          Gladiator Engagement — Score Progression
        </h3>
        {engagement.length === 0 ? (
          <p className="text-sm text-muted-foreground">No gladiator data.</p>
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={engagementChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="question" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Legend />
                  {engagement.slice(0, 6).map((g, idx) => (
                    <Line key={g.gladiatorId} type="monotone" dataKey={g.name} stroke={colors[idx % colors.length]} strokeWidth={2} dot={{ r: 3 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}