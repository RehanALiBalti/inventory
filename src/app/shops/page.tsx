'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { FullPageLoading, Button, Card, EmptyState, Alert } from '@/components/ui';
import { Icons } from '@/components/layout/Sidebar';

interface ShopData {
  id: string;
  name: string;
}

export default function ShopsPage() {
  const { userRecord, firebaseUser, loading: authLoading, signOut } = useAuth();
  const [shops, setShops] = useState<ShopData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) { router.replace('/login'); return; }
    if (!userRecord) return;
    if (userRecord.status !== 'approved') { router.replace('/account-status'); return; }

    loadShops();
  }, [authLoading, firebaseUser, userRecord, router]);

  const loadShops = async () => {
    setLoading(true);
    const res = await apiFetch<ShopData[]>('/api/shops');
    if (res.success && res.data) {
      setShops(res.data);

      // Staff with one shop → auto-navigate
      if (userRecord?.role === 'staff' && res.data.length === 1) {
        router.replace(`/shop/${res.data[0].id}/dashboard`);
        return;
      }
    } else {
      setError(res.error || 'Failed to load shops');
    }
    setLoading(false);
  };

  if (authLoading || loading) return <FullPageLoading message="Loading shops..." />;

  const isAdmin = userRecord?.role === 'admin';

  // Staff with no shops
  if (!isAdmin && shops.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-surface-50">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary-500/10 mb-6">
            {Icons.shop}
          </div>
          <h2 className="text-2xl font-bold text-surface-900 mb-3">No Shop Access</h2>
          <p className="text-surface-400 mb-8">
            Please contact an administrator to get shop access assigned.
          </p>
          <Button variant="secondary" onClick={() => signOut()}>Sign Out</Button>
        </div>
      </div>
    );
  }

  const shopColors = [
    'from-indigo-500/20 to-violet-500/20 border-indigo-500/30',
    'from-amber-500/20 to-orange-500/20 border-amber-500/30',
    'from-emerald-500/20 to-teal-500/20 border-emerald-500/30',
    'from-rose-500/20 to-pink-500/20 border-rose-500/30',
    'from-cyan-500/20 to-blue-500/20 border-cyan-500/30',
  ];

  const shopIcons = ['⚡', '🦅', '🏪', '🏬', '🛒'];

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary-700/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-surface-900">
              {isAdmin ? 'Select Shop' : 'Your Shops'}
            </h1>
            <p className="text-surface-400 mt-1">
              {isAdmin ? 'Choose a shop to manage or use admin tools below' : 'Select a shop to view'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-surface-400">
              {userRecord?.fullName}
            </span>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              Sign Out
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="error" onDismiss={() => setError(null)} >
            {error}
          </Alert>
        )}

        {/* Shop Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
          {shops.map((shop, idx) => (
            <Card
              key={shop.id}
              hover
              padding="lg"
              onClick={() => router.push(`/shop/${shop.id}/dashboard`)}
              className={`bg-gradient-to-br ${shopColors[idx % shopColors.length]} group`}
            >
              <div className="flex items-center gap-4">
                <div className="text-4xl">
                  {shopIcons[idx % shopIcons.length]}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-surface-900 group-hover:text-primary-300 transition-colors">
                    {shop.name}
                  </h2>
                  <p className="text-sm text-surface-400 mt-1">
                    Manage this shop
                  </p>
                </div>
                <svg className="w-6 h-6 text-surface-400 group-hover:text-primary-400 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Card>
          ))}
        </div>

        {/* Admin quick links */}
        {isAdmin && (
          <div>
            <h2 className="text-lg font-semibold text-surface-700 mb-4">Global Admin Tools</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[
                { href: '/admin/staff', icon: Icons.users, label: 'Staff' },
                { href: '/admin/activity', icon: Icons.activity, label: 'Activity' },
              ].map((item) => (
                <Card
                  key={item.href}
                  hover
                  padding="sm"
                  onClick={() => router.push(item.href)}
                  className="flex items-center gap-3"
                >
                  <span className="text-surface-400">{item.icon}</span>
                  <span className="text-sm font-medium text-surface-700">{item.label}</span>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
