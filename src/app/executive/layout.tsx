"use client";

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import ExecutiveSidebar from '@/components/ExecutiveSidebar';
import { MobileSidebarHeader } from '@/components/MobileSidebarHeader';

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
    <SidebarProvider>
      <ExecutiveSidebar />
      <SidebarInset className="safe-top">
        <MobileSidebarHeader />
        <main id="main-content">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
