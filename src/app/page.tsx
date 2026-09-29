'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { FullPageLoading } from '@/components/ui';

export default function HomePage() {
  const { firebaseUser, userRecord, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!firebaseUser) {
      router.replace('/login');
      return;
    }

    if (!userRecord) return; // still loading user doc

    if (userRecord.status !== 'approved') {
      router.replace('/account-status');
      return;
    }

    router.replace('/shops');
  }, [firebaseUser, userRecord, loading, router]);

  return <FullPageLoading message="Loading your workspace..." />;
}
