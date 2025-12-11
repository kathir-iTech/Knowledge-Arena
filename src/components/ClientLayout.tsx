"use client";

import React from 'react';
import { useUser } from '@/firebase';
import { usePathname, redirect } from 'next/navigation';
import AppSidebar from '@/components/AppSidebar';
import { SidebarProvider, Sidebar, SidebarInset } from '@/components/ui/sidebar';
import { Skeleton } from './ui/skeleton';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const isAuthenticated = !!user;
  const pathname = usePathname();

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-2xl font-headline text-primary">CYBER GLADIATORS</h1>
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !['/login', '/kicked'].includes(pathname)) {
    redirect('/login');
  }
  
  if (isAuthenticated && pathname === '/login') {
    redirect('/');
  }

  // Render children without the main layout for specific pages
  if (['/login', '/kicked'].includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
