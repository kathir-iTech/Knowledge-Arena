'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { LoadingScreen } from '@/components/LoadingScreen';

const AnalyticsDashboard = dynamic(
  () => import('@/components/analytics/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })),
  { ssr: false }
);

export default function AnalyticsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Suspense fallback={<LoadingScreen />}>
        <AnalyticsDashboard />
      </Suspense>
    </div>
  );
}
