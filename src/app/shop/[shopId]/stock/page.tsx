'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import { DataTable, SearchInput, LoadingSpinner, Alert, Badge } from '@/components/ui';

interface Balance {
  id: string;
  productId: string;
  productName: string;
  locationName: string;
  quantity: number;
}

export default function ShopStockPage() {
  const params = useParams();
  const shopId = params.shopId as string;
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadStock();
  }, [shopId]);

  const loadStock = async () => {
    setLoading(true);
    const res = await apiFetch<Balance[]>(`/api/stock/balances?shopId=${shopId}&locationType=shop`);
    if (res.success && res.data) {
      setBalances(res.data);
    } else {
      setError(res.error || 'Failed to load stock');
    }
    setLoading(false);
  };

  const filtered = balances.filter(b =>
    b.productName?.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    { key: 'productName', header: 'Product', render: (b: Balance) => (
      <span className="font-medium text-surface-900">{b.productName}</span>
    )},
    { key: 'quantity', header: 'Quantity', render: (b: Balance) => (
      <span className={`font-bold ${b.quantity <= 0 ? 'text-danger-500' : b.quantity <= 10 ? 'text-warning-500' : 'text-surface-900'}`}>
        {b.quantity.toLocaleString()}
      </span>
    )},
    { key: 'status', header: 'Status', render: (b: Balance) => (
      b.quantity <= 0 ? <Badge variant="danger">Out of Stock</Badge> :
      b.quantity <= 10 ? <Badge variant="warning">Low</Badge> :
      <Badge variant="success">In Stock</Badge>
    )},
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Shop Stock" description="Current inventory levels in this shop" />
      
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search products..." />
      </div>

      <div className="glass-card overflow-hidden">
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(b) => b.id}
          loading={loading}
          emptyMessage="No stock in this shop yet"
        />
      </div>

      <p className="text-xs text-surface-400 mt-4 text-center">
        Total: {filtered.reduce((s, b) => s + b.quantity, 0).toLocaleString()} units across {filtered.length} products
      </p>
    </div>
  );
}
