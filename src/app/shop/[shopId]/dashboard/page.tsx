'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import { StatCard, LoadingSpinner, Alert } from '@/components/ui';
import { Icons } from '@/components/layout/Sidebar';

// Dynamically import charts to avoid blocking initial render and reduce bundle size
const DashboardCharts = dynamic(() => import('@/components/dashboard/DashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[300px] mt-8 bg-surface-50 border border-surface-200 rounded-2xl">
      <LoadingSpinner />
    </div>
  )
});

interface DashboardData {
  shopName: string;
  shopStockCount: number;
  warehouseStockCount: number;
  todayReceived: number;
  todayTransferred: number;
  todaySold: number;
  lowStockProducts: number;
  linkedWarehouses: number;
}

export default function ShopDashboardPage() {
  const params = useParams();
  const shopId = params.shopId as string;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, [shopId]);

  const loadDashboard = async () => {
    setLoading(true);
    const res = await apiFetch<DashboardData>(`/api/dashboard?shopId=${shopId}`);
    if (res.success && res.data) {
      setData(res.data);
    } else {
      setError(res.error || 'Failed to load dashboard');
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <LoadingSpinner className="py-20" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title={`${data.shopName} Dashboard`}
        description="Overview of today's inventory activity"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        <StatCard
          label={`${data.shopName} Stock`}
          value={data.shopStockCount.toLocaleString()}
          sublabel="Total units in this shop"
          icon={Icons.inventory}
        />
        <StatCard
          label="Linked Warehouse Stock"
          value={data.warehouseStockCount.toLocaleString()}
          sublabel={`Shared across ${data.linkedWarehouses} warehouse(s)`}
          icon={Icons.warehouse}
        />
        <StatCard
          label="Received Today"
          value={data.todayReceived.toLocaleString()}
          sublabel="Units added to linked warehouse(s)"
          icon={Icons.received}
        />
        <StatCard
          label="Transferred Today"
          value={data.todayTransferred.toLocaleString()}
          sublabel={`Into ${data.shopName}`}
          icon={Icons.transfer}
        />
        <StatCard
          label="Sold Today"
          value={data.todaySold.toLocaleString()}
          sublabel={`From ${data.shopName}`}
          icon={Icons.sale}
        />
        <StatCard
          label="Low Stock"
          value={data.lowStockProducts}
          sublabel="Products below threshold"
          icon={Icons.lowStock}
          className={data.lowStockProducts > 0 ? 'border-warning-500/30' : ''}
        />
      </div>

      <DashboardCharts data={data} />
    </div>
  );
}
