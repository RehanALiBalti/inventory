'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { FullPageLoading } from '@/components/ui';

interface ShopData {
  id: string;
  name: string;
  linkedWarehouseIds: string[];
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const shopId = params.shopId as string;
  const { userRecord, firebaseUser, loading: authLoading } = useAuth();
  const [shop, setShop] = useState<ShopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) { router.replace('/login'); return; }
    if (!userRecord) return;
    if (userRecord.status !== 'approved') { router.replace('/account-status'); return; }

    // Permission check
    const isAdmin = userRecord.role === 'admin';
    const hasAccess = isAdmin || userRecord.shopPermissions?.[shopId]?.view === true;
    if (!hasAccess) {
      router.replace('/shops');
      return;
    }

    loadShop();
  }, [authLoading, firebaseUser, userRecord, shopId, router]);

  const loadShop = async () => {
    setLoading(true);
    const res = await apiFetch<ShopData[]>('/api/shops');
    if (res.success && res.data) {
      const found = res.data.find(s => s.id === shopId);
      if (found) {
        setShop(found);
      } else {
        setError('Shop not found or access denied');
        router.replace('/shops');
      }
    } else {
      setError(res.error || 'Failed to load shop');
    }
    setLoading(false);
  };

  if (authLoading || loading || !shop) {
    return <FullPageLoading message="Loading shop..." />;
  }

  return (
    <AppLayout shopId={shopId} shopName={shop.name}>
      {children}
    </AppLayout>
  );
}
