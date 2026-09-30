'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import { StatCard, LoadingSpinner, Alert } from '@/components/ui';
import { Icons } from '@/components/layout/Sidebar';

import Link from 'next/link';

// Dynamically import charts to avoid blocking initial render and reduce bundle size
const DashboardCharts = dynamic(() => import('@/components/dashboard/DashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[300px] mt-8 bg-surface-50 border border-surface-200 rounded-2xl">
      <LoadingSpinner />
    </div>
  )
});

interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  currentQty: number;
  threshold: number;
  warehouseQty: number;
}

interface DashboardData {
  shopName: string;
  shopStockCount: number;
  warehouseStockCount: number;
  todayReceived: number;
  todayTransferred: number;
  todaySold: number;
  lowStockProducts: number;
  lowStockItems?: LowStockItem[];
  linkedWarehouses: number;
}

export default function ShopDashboardPage() {
  const params = useParams();
  const shopId = params.shopId as string;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLowStockList, setShowLowStockList] = useState(false);

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

      {/* 🚨 Smart Low-Stock Alert Banner */}
      {data.lowStockProducts > 0 && (
        <div className="rounded-2xl border border-warning-500/30 bg-gradient-to-r from-warning-500/10 via-warning-500/5 to-transparent p-4 sm:p-5 shadow-sm transition-all duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="relative shrink-0 mt-0.5">
                <span className="flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-warning-500"></span>
                </span>
              </div>
              <div>
                <h2 className="text-base font-bold text-surface-900 flex items-center gap-2">
                  <span>🚨 Attention:</span> {data.lowStockProducts} {data.lowStockProducts === 1 ? 'Product is' : 'Products are'} Running Low on Stock!
                </h2>
                <p className="text-xs text-surface-500 mt-0.5">
                  Items are at or below minimum threshold. Transfer stock from warehouse to avoid running out.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
              <button
                onClick={() => setShowLowStockList(!showLowStockList)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-surface-200 text-surface-700 hover:bg-surface-50 transition-colors shadow-sm"
              >
                {showLowStockList ? 'Hide Details' : `View Low Items (${data.lowStockProducts})`}
              </button>
              <Link
                href={`/shop/${shopId}/warehouse-stock`}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-warning-500 hover:bg-warning-600 text-white shadow-md shadow-warning-500/20 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Transfer from Warehouse
              </Link>
            </div>
          </div>

          {/* Expandable Low Stock Items List */}
          {showLowStockList && data.lowStockItems && data.lowStockItems.length > 0 && (
            <div className="mt-4 pt-4 border-t border-warning-500/20 animate-slide-up">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {data.lowStockItems.map(item => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-white/80 border border-surface-200/80 shadow-sm flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1 mr-2">
                      <p className="text-xs font-semibold text-surface-900 truncate">{item.name}</p>
                      <p className="text-[10px] font-mono text-surface-400">{item.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-danger-500">
                        {item.currentQty} in shop
                      </div>
                      <div className="text-[10px] text-surface-400">
                        Warehouse: <span className="font-semibold text-primary-600">{item.warehouseQty}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
