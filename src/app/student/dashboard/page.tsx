import StudentDashboard from '@/components/dashboard/StudentDashboard';

export default async function StudentDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const roomCode = params?.roomCode;
  return <StudentDashboard initialRoomCode={typeof roomCode === 'string' ? roomCode.toUpperCase() : undefined} />;
}
