"use client";

import React from 'react';
import { useUser } from '@/firebase';
import { usePathname, redirect } from 'next/navigation';
import AppSidebar from '@/components/AppSidebar';
import { SidebarProvider, Sidebar, SidebarInset } from '@/components/ui/sidebar';
import { Skeleton } from './ui/skeleton';
import { BotMessageSquare } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { user: firebaseUser, isUserLoading } = useUser();
  const { user: contextUser } = useAuth();
  const user = contextUser || firebaseUser;
  const isAuthenticated = !!user;
  const pathname = usePathname();
  
  // Use the role from our application context which is more reliable
  const userRole = contextUser?.role;

  if (isUserLoading) {
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

  const isAuthPage = pathname === '/';
  const isKickedPage = pathname === '/kicked';

  // If user is not authenticated and not on a public page, redirect to login
  if (!isAuthenticated && !isAuthPage && !isKickedPage) {
    redirect('/');
  }

  // If user is authenticated and on the login page, redirect to their dashboard
  if (isAuthenticated && isAuthPage) {
     if (userRole === 'Teacher') {
      redirect('/teacher/dashboard');
    } else if (userRole === 'Student') {
      redirect('/student/dashboard');
    }
  }

  // Render auth/kicked pages without the main layout
  if (isAuthPage || isKickedPage) {
    return <>{children}</>;
  }

  // Enforce strict role-based access control for all other pages
  if (isAuthenticated && userRole) {
    const isTeacherPage = pathname.startsWith('/teacher') || pathname.startsWith('/create-quiz');
    const isStudentPage = pathname.startsWith('/student') || pathname.startsWith('/battle');

    if (userRole === 'Teacher' && isStudentPage) {
       redirect('/teacher/dashboard');
       return null; // Return null to prevent rendering the student page
    }
    
    if (userRole === 'Student' && isTeacherPage) {
       redirect('/student/dashboard');
       return null; // Return null to prevent rendering the teacher page
    }
  }


  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
