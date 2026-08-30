import { Suspense } from 'react';
import { LoadingScreen } from '@/components/LoadingScreen';
import DynamicGladiatorDashboard from './DynamicGladiatorDashboard';

export default async function GladiatorDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const roomCode = params?.roomCode;
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DynamicGladiatorDashboard initialRoomCode={typeof roomCode === 'string' ? roomCode.toUpperCase() : undefined} />
    </Suspense>
  );
}