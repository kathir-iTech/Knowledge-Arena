"use client";

import React from 'react';
import { useUser } from '@/firebase';
import { usePathname, redirect } from 'next/navigation';
import AppSidebar from '@/components/AppSidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { Skeleton } from './ui/skeleton';
import { BrainCircuit } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { user: firebaseUser, isUserLoading } = useUser();
  const { user: contextUser, isLoading: isAuthContextLoading } = useAuth();
  
  const isLoading = isUserLoading || isAuthContextLoading;
  const user = contextUser || (firebaseUser ? { id: firebaseUser.uid, email: firebaseUser.email || '', name: firebaseUser.displayName || 'User', role: 'Student', avatar: '🧑‍💻' } : null);
  const isAuthenticated = !!user;
  const pathname = usePathname();
  
  const userRole = contextUser?.role;

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

  const publicPages = ['/'];
  const isPublicPage = publicPages.includes(pathname);

  // If user is not authenticated and not on a public page, redirect to home
  if (!isAuthenticated && !isPublicPage) {
    redirect('/');
    return null;
  }
  
  // These pages are standalone and should not have the main layout
  const specialPages = ['/kicked', '/cheating-detected'];
  if (specialPages.includes(pathname)) {
      return <>{children}</>;
  }

  // If user is authenticated and on the home page, redirect to their dashboard
  if (isAuthenticated && pathname === '/') {
     if (userRole === 'Teacher') {
      redirect('/teacher/dashboard');
    } else if (userRole === 'Student') {
      redirect('/student/dashboard');
    }
    return null; // Show loading or nothing while redirecting
  }

  // If on a public page (like login), just render children without sidebar
  if (isPublicPage) {
    return <>{children}</>;
  }

  // Role-based routing protection for authenticated users
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
