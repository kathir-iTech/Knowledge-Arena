'use client';

import dynamic from 'next/dynamic';
import { LoadingScreen } from '@/components/LoadingScreen';

const CommanderDashboard = dynamic(
  () => import('@/components/dashboard/CommanderDashboard').then(m => ({ default: m.default })),
  { ssr: false, loading: () => <LoadingScreen /> }
);

export default function DynamicCommanderDashboard() {
  return <CommanderDashboard />;
}
