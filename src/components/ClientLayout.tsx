
"use client";

import React, { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import AppSidebar from '@/components/AppSidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { LoadingScreen } from '@/components/LoadingScreen';

const CopilotChat = dynamic(() => import('@/components/copilot/CopilotChat').then(m => m.CopilotChat), { ssr: false });

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const redirecting = useRef<string | null>(null);
  
  const isPublicPage = pathname === '/';
  const specialPages = ['/kicked', '/cheating-detected'];

  useEffect(() => {
    if (isLoading) return;

    const currentPath = pathname;
    const skipPages = ['/kicked', '/cheating-detected'];
    if (skipPages.includes(currentPath)) {
      redirecting.current = null;
      return;
    }

    if (!user) {
      if (currentPath !== '/') {
        router.replace('/');
      }
      redirecting.current = null;
      return;
    }

    if (!user.role || (user.role !== 'teacher' && user.role !== 'student')) {
      redirecting.current = null;
      return;
    }

    if (currentPath.startsWith('/battle')) {
      redirecting.current = null;
      return;
    }

    let target: string | null = null;

    if (currentPath === '/') {
      target = user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard';
    } else {
      const isTeacherPage = currentPath.startsWith('/teacher') || currentPath.startsWith('/create-quiz');
      const isStudentPage = currentPath.startsWith('/student');

      if (user.role === 'teacher' && isStudentPage) target = '/teacher/dashboard';
      else if (user.role === 'student' && isTeacherPage) target = '/student/dashboard';
    }

    if (target) {
      if (redirecting.current !== target) {
        redirecting.current = target;
        router.replace(target);
      }
      return;
    }

    redirecting.current = null;
  }, [user, isLoading, pathname, router]);

  if (isLoading) {
    return <LoadingScreen message="Authenticating..." />;
  }

  if (specialPages.includes(pathname)) {
    return <>{children}</>;
  }

  if (!user && isPublicPage) {
    return <>{children}</>;
  }

  if (user && pathname.startsWith('/battle')) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="safe-bottom">{children}</SidebarInset>
        <CopilotChat />
      </SidebarProvider>
    );
  }

  if (user) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>{children}</SidebarInset>
        <CopilotChat />
      </SidebarProvider>
    );
  }

  return <>{children}</>;
}
