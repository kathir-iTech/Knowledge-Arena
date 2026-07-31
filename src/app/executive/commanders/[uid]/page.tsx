'use client';

import { useParams } from 'next/navigation';
import UserDetail from '@/components/executive/user-detail';

export default function ExecutiveCommanderDetailPage() {
  const params = useParams<{ uid: string }>();
  return <UserDetail uid={params.uid} expectedRole="commander" />;
}
