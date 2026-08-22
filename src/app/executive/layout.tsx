"use client";

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import ExecutiveSidebar from '@/components/ExecutiveSidebar';
import { MobileSidebarHeader } from '@/components/MobileSidebarHeader';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ExecutiveOnboarding } from '@/components/onboarding/ExecutiveOnboarding';
import { GlobalSearch } from '@/components/GlobalSearch';

export default function ExecutiveLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (user.role !== 'executive') {
      router.replace('/');
      return;
    }
  }, [user, isLoading, router]);

  return (
    <ErrorBoundary>
      <SidebarProvider>
        <ExecutiveSidebar />
        <SidebarInset className="safe-top">
          <MobileSidebarHeader />
          <GlobalSearch />
          <main id="main-content">
            <ExecutiveOnboarding />
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </ErrorBoundary>
  );
}
