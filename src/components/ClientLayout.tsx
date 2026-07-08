
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

  if (!user && !isPublicPage) {
    redirect('/');
    return null;
  }
  
  if (!user && isPublicPage) {
    return <>{children}</>;
  }
  
  if (user) {
    const isBattlePage = pathname.startsWith('/battle');
    // Allow both teachers and students to access battle pages
    if (isBattlePage) {
       return (
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
      );
    }
    
    if (pathname === '/') {
        if (user.role === 'teacher') {
         redirect('/teacher/dashboard');
       } else {
         redirect('/student/dashboard');
       }
       return null;
     }

     const isTeacherPage = pathname.startsWith('/teacher') || pathname.startsWith('/create-quiz');
     const isStudentPage = pathname.startsWith('/student');

     if (user.role === 'teacher' && isStudentPage) {
        redirect('/teacher/dashboard');
        return null;
     }
     
     if (user.role === 'student' && isTeacherPage) {
       redirect('/student/dashboard');
       return null;
    }
    
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    );
  }

  return <>{children}</>;
}
