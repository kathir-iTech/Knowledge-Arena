"use client";

import React from 'react';
import { useUser } from '@/firebase';
import { usePathname, redirect } from 'next/navigation';
import AppSidebar from '@/components/AppSidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { Skeleton } from './ui/skeleton';
import { BotMessageSquare } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { user: firebaseUser, isUserLoading } = useUser();
  const { user: contextUser, isLoading: isAuthContextLoading } = useAuth();
  
  const isLoading = isUserLoading || isAuthContextLoading;
  const user = contextUser || firebaseUser;
  const isAuthenticated = !!user;
  const pathname = usePathname();
  
  const userRole = contextUser?.role;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <BotMessageSquare className="w-16 h-16 text-primary mx-auto animate-pulse" />
          <h1 className="text-2xl font-headline text-primary">CYBER GLADIATORS</h1>
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    );
  }

  const publicPages = ['/', '/kicked', '/cheating-detected'];
  const isPublicPage = publicPages.includes(pathname);

  if (!isAuthenticated && !isPublicPage) {
    redirect('/');
    return null;
  }

  if (isAuthenticated && pathname === '/') {
     if (userRole === 'Teacher') {
      redirect('/teacher/dashboard');
    } else if (userRole === 'Student') {
      redirect('/student/dashboard');
    }
    return null;
  }

  if (isPublicPage) {
    return <>{children}</>;
  }

  if (isAuthenticated && userRole) {
    const isTeacherPage = pathname.startsWith('/teacher') || pathname.startsWith('/create-quiz');
    const isStudentPage = pathname.startsWith('/student') || pathname.startsWith('/battle');

    if (userRole === 'Teacher' && isStudentPage) {
       redirect('/teacher/dashboard');
       return null;
    }
    
    if (userRole === 'Student' && isTeacherPage) {
       redirect('/student/dashboard');
       return null;
    }
  }


  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
