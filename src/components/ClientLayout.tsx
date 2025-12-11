"use client";

import React from 'react';
import { useUser } from '@/firebase';
import { usePathname, redirect } from 'next/navigation';
import AppSidebar from '@/components/AppSidebar';
import { SidebarProvider, Sidebar, SidebarInset } from '@/components/ui/sidebar';
import { Skeleton } from './ui/skeleton';
import { BotMessageSquare } from 'lucide-react';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const isAuthenticated = !!user;
  const pathname = usePathname();
  const userRole = (user?.reloadUserInfo as any)?.customAttributes?.role;

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

  if (!isAuthenticated && !isAuthPage && !isKickedPage) {
    redirect('/');
  }

  if (isAuthenticated && isAuthPage) {
     if (userRole === 'Teacher') {
      redirect('/teacher/dashboard');
    } else {
      redirect('/student/dashboard');
    }
  }

  // Render children without the main layout for specific pages
  if (isAuthPage || isKickedPage) {
    return <>{children}</>;
  }

  // Enforce role-based access
  if (isAuthenticated) {
    if (userRole === 'Teacher' && !pathname.startsWith('/teacher')) {
      if (pathname.startsWith('/student') || pathname.startsWith('/battle')) {
         redirect('/teacher/dashboard');
      }
    }
    if (userRole === 'Student' && !pathname.startsWith('/student')) {
       if (pathname.startsWith('/teacher') || pathname.startsWith('/create-quiz')) {
         redirect('/student/dashboard');
       }
    }
  }


  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
