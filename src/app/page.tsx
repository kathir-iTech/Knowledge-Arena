"use client";

import { useAuth } from '@/hooks/useAuth';
import TeacherDashboard from '@/components/dashboard/TeacherDashboard';
import StudentDashboard from '@/components/dashboard/StudentDashboard';
import { Skeleton } from '@/components/ui/skeleton';

export default function Home() {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-1/4 mb-6" />
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return user.role === 'Teacher' ? <TeacherDashboard /> : <StudentDashboard />;
}
