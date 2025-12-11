"use client";

import { useUser } from '@/firebase';
import TeacherDashboard from '@/components/dashboard/TeacherDashboard';
import StudentDashboard from '@/components/dashboard/StudentDashboard';
import { Skeleton } from '@/components/ui/skeleton';

export default function Home() {
  const { user, isUserLoading } = useUser();

  if (isUserLoading || !user) {
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

  const userRole = (user.reloadUserInfo as any).customAttributes?.role;

  return userRole === 'Teacher' ? <TeacherDashboard /> : <StudentDashboard />;
}
