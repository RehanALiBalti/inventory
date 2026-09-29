'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button, FullPageLoading } from '@/components/ui';

export default function AccountStatusPage() {
  const { userRecord, firebaseUser, loading, signOut } = useAuth();
  const router = useRouter();

  if (loading) return <FullPageLoading />;

  if (!firebaseUser) {
    router.replace('/login');
    return <FullPageLoading />;
  }

  if (userRecord?.status === 'approved') {
    router.replace('/shops');
    return <FullPageLoading />;
  }

  const status = userRecord?.status || 'pending';

  const statusConfig = {
    pending: {
      icon: (
        <svg className="w-16 h-16 text-warning-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      title: 'Approval Pending',
      description: 'Your account is waiting for admin approval. You will be able to access the system once approved.',
      color: 'warning',
    },
    rejected: {
      icon: (
        <svg className="w-16 h-16 text-danger-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      ),
      title: 'Account Rejected',
      description: 'Your account has been rejected. Please contact an administrator for more information.',
      color: 'danger',
    },
    disabled: {
      icon: (
        <svg className="w-16 h-16 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      title: 'Account Disabled',
      description: 'Your account has been disabled. Please contact an administrator.',
      color: 'neutral',
    },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-50">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative text-center max-w-md">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/50 mb-6 animate-pulse-soft">
          {config.icon}
        </div>
        <h2 className="text-2xl font-bold text-surface-900 mb-3">{config.title}</h2>
        <p className="text-surface-400 mb-2">{config.description}</p>
        {userRecord?.fullName && (
          <p className="text-sm text-surface-400 mb-8">
            Signed in as <span className="text-surface-700">{userRecord.fullName}</span>
          </p>
        )}
        <Button variant="secondary" onClick={() => signOut()}>
          Sign Out
        </Button>
      </div>
    </div>
  );
}
