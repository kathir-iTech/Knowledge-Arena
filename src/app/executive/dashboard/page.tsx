'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ExecutiveDashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/executive/analytics');
  }, [router]);

  return null;
}
