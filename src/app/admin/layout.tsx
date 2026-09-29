'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { FullPageLoading } from '@/components/ui';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userRecord, firebaseUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) { router.replace('/login'); return; }
    if (!userRecord) return;
    if (userRecord.status !== 'approved') { router.replace('/account-status'); return; }
    if (userRecord.role !== 'admin') { router.replace('/shops'); return; }
  }, [loading, firebaseUser, userRecord, router]);

  if (loading || !userRecord || userRecord.role !== 'admin') {
    return <FullPageLoading />;
  }

  return <AppLayout>{children}</AppLayout>;
}
