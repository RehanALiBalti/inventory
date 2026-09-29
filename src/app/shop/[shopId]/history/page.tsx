'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import { DataTable, Badge, Select, Alert } from '@/components/ui';

interface Movement {
  id: string; type: string; lineItems: { productName: string; quantity: number }[];
  sourceLocationName?: string; destLocationName?: string; actorName: string;
  recordedAt: string; occurredAt?: string; reversed: boolean; notes?: string;
}

const typeLabels: Record<string, string> = {
  stock_received: 'Received',
  warehouse_to_shop_transfer: 'Transfer (WH→Shop)',
  warehouse_to_warehouse_transfer: 'Transfer (WH→WH)',
  sale: 'Sale',
  reversal: 'Reversal',
  adjustment: 'Adjustment',
  opening_balance: 'Opening Balance',
};

export default function ShopHistoryPage() {
  const params = useParams();
  const shopId = params.shopId as string;
  const { userRecord } = useAuth();
  const isAdmin = userRecord?.role === 'admin';

  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => { loadMovements(); }, [shopId, typeFilter]);

  const loadMovements = async () => {
    setLoading(true);
    let url = `/api/stock/movements?shopId=${shopId}&limit=50`;
    if (typeFilter) url += `&type=${typeFilter}`;
    if (!isAdmin) url += '&ownOnly=true';

    const res = await apiFetch<Movement[]>(url);
    if (res.success && res.data) setMovements(res.data);
    else setError(res.error || 'Failed to load history');
    setLoading(false);
  };

  const columns = [
    { key: 'recordedAt', header: 'Date', render: (m: Movement) => (
      <span className="text-xs text-surface-400">{m.recordedAt ? new Date(m.recordedAt).toLocaleString() : '-'}</span>
    )},
    { key: 'type', header: 'Type', render: (m: Movement) => (
      <Badge variant={m.type === 'reversal' ? 'danger' : m.type === 'sale' ? 'info' : 'neutral'}>
        {typeLabels[m.type] || m.type}
      </Badge>
    )},
    { key: 'items', header: 'Items', render: (m: Movement) => (
      <div className="space-y-0.5">
        {m.lineItems?.slice(0, 3).map((li, i) => (
          <div key={i} className="text-xs">
            <span className="text-surface-800">{li.productName}</span>
            <span className="text-primary-400 ml-1">×{li.quantity}</span>
          </div>
        ))}
        {(m.lineItems?.length || 0) > 3 && <span className="text-xs text-surface-400">+{m.lineItems.length - 3} more</span>}
      </div>
    )},
    { key: 'actor', header: 'By', render: (m: Movement) => <span className="text-xs text-surface-700">{m.actorName}</span> },
    { key: 'status', header: 'Status', render: (m: Movement) => (
      m.reversed ? <Badge variant="danger">Reversed</Badge> : <Badge variant="success">Active</Badge>
    )},
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Transaction History" description={isAdmin ? 'All shop transactions' : 'Your transaction history'} />
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      <div className="mb-4 max-w-xs">
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} placeholder="All types"
          options={Object.entries(typeLabels).map(([val, label]) => ({ value: val, label }))} />
      </div>
      <div className="glass-card overflow-hidden">
        <DataTable columns={columns} data={movements} keyExtractor={(m) => m.id} loading={loading} emptyMessage="No transactions found" />
      </div>
    </div>
  );
}
