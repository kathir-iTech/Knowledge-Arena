
"use client";

import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePathname, redirect } from 'next/navigation';
import AppSidebar from '@/components/AppSidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { Skeleton } from './ui/skeleton';
import { BrainCircuit } from 'lucide-react';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  
  const isPublicPage = pathname === '/';
  const specialPages = ['/kicked', '/cheating-detected'];

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

  // If there's no user and they are not on the public login page, force them there.
  if (!user && !isPublicPage) {
    redirect('/');
    return null;
  }
  
  // If there is no user and they are on the public login page, show it.
  if (!user && isPublicPage) {
    return <>{children}</>;
  }
  
  // If there is a user
  if (user) {
    // and they are on the root login page, redirect them to their dashboard
    if (pathname === '/') {
       if (user.role === 'Teacher') {
        redirect('/teacher/dashboard');
      } else {
        redirect('/student/dashboard');
      }
      return null;
    }

    // Role-based protection for authenticated users
    const isTeacherPage = pathname.startsWith('/teacher') || pathname.startsWith('/create-quiz');
    const isStudentPage = pathname.startsWith('/student') || pathname.startsWith('/battle');

    if (user.role === 'Teacher' && isStudentPage) {
       redirect('/teacher/dashboard');
       return null;
    }
    
    if (user.role === 'Student' && isTeacherPage) {
       redirect('/student/dashboard');
       return null;
    }
    
    // Otherwise, show the authenticated layout with the sidebar.
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    );
  }

  // Fallback for any unhandled case (should not be reached)
  return <>{children}</>;
}
