import StudentDashboard from '@/components/dashboard/StudentDashboard';

export default function StudentDashboardPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
    const roomCode = searchParams?.roomCode;
    return <StudentDashboard initialRoomCode={typeof roomCode === 'string' ? roomCode.toUpperCase() : undefined} />;
}
