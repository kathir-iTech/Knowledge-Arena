"use client";

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import GladiatorSidebar from '@/components/GladiatorSidebar';
import { MobileSidebarHeader } from '@/components/MobileSidebarHeader';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { GlobalSearch } from '@/components/GlobalSearch';

export default function GladiatorLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (user.role !== 'gladiator') {
      router.replace('/');
      return;
    }
  }, [user, isLoading, router]);

  return (
    <ErrorBoundary>
      <SidebarProvider>
        <GladiatorSidebar />
        <SidebarInset className="safe-top">
          <MobileSidebarHeader />
          <GlobalSearch />
          <main id="main-content">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </ErrorBoundary>
  );
}
