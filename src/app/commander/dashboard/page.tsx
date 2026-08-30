import { Suspense } from 'react';
import { LoadingScreen } from '@/components/LoadingScreen';
import DynamicCommanderDashboard from './DynamicCommanderDashboard';

export default function CommanderDashboardPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DynamicCommanderDashboard />
    </Suspense>
  );
}