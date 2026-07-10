
"use client";

import React, { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePathname, useRouter } from 'next/navigation';
import AppSidebar from '@/components/AppSidebar';
import { CopilotChat } from '@/components/copilot/CopilotChat';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { Skeleton } from './ui/skeleton';
import { BrainCircuit } from 'lucide-react';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  
  const isPublicPage = pathname === '/';
  const specialPages = ['/kicked', '/cheating-detected'];

  useEffect(() => {
    if (isLoading) return;

    const currentPath = pathname;
    if (currentPath === '/kicked' || currentPath === '/cheating-detected') return;

    if (!user && currentPath !== '/') {
      router.replace('/');
      return;
    }

    if (!user) return;

    if (!user.role) return;

    if (user.role !== 'teacher' && user.role !== 'student') return;

    if (currentPath.startsWith('/battle')) return;

    if (currentPath === '/') {
      router.replace(user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
      return;
    }

    const isTeacherPage = currentPath.startsWith('/teacher') || currentPath.startsWith('/create-quiz');
    const isStudentPage = currentPath.startsWith('/student');

    if (user.role === 'teacher' && isStudentPage) {
      router.replace('/teacher/dashboard');
      return;
    }

    if (user.role === 'student' && isTeacherPage) {
      router.replace('/student/dashboard');
      return;
    }
  }, [user, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <BrainCircuit className="w-16 h-16 text-primary mx-auto animate-pulse" />
          <h1 className="text-2xl font-headline text-primary">KNOWLEDGE ARENA</h1>
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    );
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
