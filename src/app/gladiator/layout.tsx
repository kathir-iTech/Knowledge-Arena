"use client";

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import GladiatorSidebar from '@/components/GladiatorSidebar';

export default function GladiatorLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (user.role !== 'student') {
      router.replace('/commander/dashboard');
      return;
    }
  }, [user, isLoading, router]);

  return (
    <SidebarProvider>
      <GladiatorSidebar />
      <SidebarInset className="safe-top"><main id="main-content">{children}</main></SidebarInset>
    </SidebarProvider>
  );
}
