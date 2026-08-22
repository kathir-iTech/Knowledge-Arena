"use client";

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import CommanderSidebar from '@/components/CommanderSidebar';
import { MobileSidebarHeader } from '@/components/MobileSidebarHeader';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CommanderOnboarding } from '@/components/onboarding/CommanderOnboarding';
import { GlobalSearch } from '@/components/GlobalSearch';

export default function CommanderLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (user.role !== 'commander') {
      router.replace('/');
      return;
    }
  }, [user, isLoading, router]);

  return (
    <ErrorBoundary>
      <SidebarProvider>
        <CommanderSidebar />
        <SidebarInset className="safe-top">
          <MobileSidebarHeader />
          <GlobalSearch />
          <main id="main-content">
            <CommanderOnboarding />
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </ErrorBoundary>
  );
}
