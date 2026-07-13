'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { LoadingScreen } from '@/components/LoadingScreen';

const AnalyticsDashboard = dynamic(
  () => import('@/components/analytics/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })),
  { ssr: false }
);

export default function ExecutiveDashboardPage() {
  return (
    <div className="page-container page-section">
      <Suspense fallback={<LoadingScreen />}>
        <AnalyticsDashboard />
      </Suspense>
    </div>
  );
}
