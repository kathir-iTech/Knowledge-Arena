'use client';

import dynamic from 'next/dynamic';
import { LoadingScreen } from '@/components/LoadingScreen';

const GladiatorDashboard = dynamic(
  () => import('@/components/dashboard/GladiatorDashboard').then(m => ({ default: m.default })),
  { ssr: false, loading: () => <LoadingScreen /> }
);

export default function DynamicGladiatorDashboard({ initialRoomCode }: { initialRoomCode?: string }) {
  return <GladiatorDashboard initialRoomCode={initialRoomCode} />;
}
