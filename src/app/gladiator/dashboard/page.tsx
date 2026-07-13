import GladiatorDashboard from '@/components/dashboard/GladiatorDashboard';

export default async function GladiatorDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const roomCode = params?.roomCode;
  return <GladiatorDashboard initialRoomCode={typeof roomCode === 'string' ? roomCode.toUpperCase() : undefined} />;
}
