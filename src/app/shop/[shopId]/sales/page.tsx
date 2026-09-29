'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useHasShopPermission } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import { Button, Input, Alert, Card, ConfirmDialog, SearchInput, EmptyState, DataTable, Badge } from '@/components/ui';
import { v4 as uuidv4 } from 'uuid';

interface ProductOption { id: string; name: string; sku: string; }
interface LineItem { productId: string; productName: string; quantity: number; }
interface Balance { id: string; productId: string; productName: string; quantity: number; }
interface Movement {
  id: string; lineItems: { productName: string; quantity: number }[];
  actorName: string; recordedAt: string; occurredAt: string; reversed: boolean; notes?: string;
}

export default function SalesPage() {
  const params = useParams();
  const shopId = params.shopId as string;
  const canSell = useHasShopPermission(shopId, 'recordSale');

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [shopBalances, setShopBalances] = useState<Balance[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<Movement[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [tab, setTab] = useState<'new' | 'history'>('new');

  useEffect(() => { loadData(); }, [shopId]);

  const loadData = async () => {
    const [prodRes, balRes] = await Promise.all([
      apiFetch<ProductOption[]>(`/api/products?shopId=${shopId}`),
      apiFetch<Balance[]>(`/api/stock/balances?shopId=${shopId}&locationType=shop`),
    ]);
    if (prodRes.success && prodRes.data) setProducts(prodRes.data);
    if (balRes.success && balRes.data) setShopBalances(balRes.data);
    loadHistory();
  };

  const loadHistory = async () => {
    setHistLoading(true);
    const res = await apiFetch<Movement[]>(`/api/stock/movements?shopId=${shopId}&type=sale&limit=30`);
    if (res.success && res.data) setHistory(res.data);
    setHistLoading(false);
  };

  const addLineItem = (p: ProductOption) => {
    if (lineItems.find(li => li.productId === p.id)) return;
    setLineItems([...lineItems, { productId: p.id, productName: p.name, quantity: 1 }]);
    setProductSearch('');
  };

  const updateQuantity = (idx: number, qty: number) => {
    const updated = [...lineItems];
    updated[idx] = { ...updated[idx], quantity: Math.max(1, qty) };
    setLineItems(updated);
  };

  const removeLineItem = (idx: number) => setLineItems(lineItems.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const res = await apiFetch('/api/stock/sale', {
      method: 'POST',
      body: JSON.stringify({
        shopId,
        requestKey: uuidv4(),
        lineItems: lineItems.map(li => ({ productId: li.productId, quantity: li.quantity })),
        occurredAt: new Date(saleDate).toISOString(),
        notes: notes.trim() || undefined,
      }),
    });

    if (res.success) {
      setSuccess('Sale recorded successfully!');
      setLineItems([]);
      setNotes('');
      setConfirmOpen(false);
      const balRes = await apiFetch<Balance[]>(`/api/stock/balances?shopId=${shopId}&locationType=shop`);
      if (balRes.success && balRes.data) setShopBalances(balRes.data);
      loadHistory();
    } else {
      setError(res.error || 'Failed to record sale');
      setConfirmOpen(false);
    }
    setSubmitting(false);
  };

  const filteredProducts = products.filter(p =>
    (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku.toLowerCase().includes(productSearch.toLowerCase())) &&
    !lineItems.find(li => li.productId === p.id)
  );

  if (!canSell && tab === 'new') {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Sales" />
        <EmptyState title="No Sales Permission" description="You don't have permission to record sales for this shop." />
        <div className="mt-4">
          <Button variant="secondary" onClick={() => setTab('history')}>View Sales History</Button>
        </div>
      </div>
    );
  }

  const histColumns = [
    { key: 'occurredAt', header: 'Sale Date', render: (m: Movement) => (
      <div>
        <span className="text-xs text-surface-800">{m.occurredAt ? new Date(m.occurredAt).toLocaleDateString() : '-'}</span>
        <span className="text-[10px] text-surface-400 ml-2">
          entered {m.recordedAt ? new Date(m.recordedAt).toLocaleString() : '-'}
        </span>
      </div>
    )},
    { key: 'items', header: 'Items', render: (m: Movement) => (
      <div className="space-y-0.5">
        {m.lineItems?.map((li, i) => (
          <div key={i} className="text-xs">
            <span className="text-surface-800">{li.productName}</span>
            <span className="text-primary-400 ml-1">×{li.quantity}</span>
          </div>
        ))}
      </div>
    )},
    { key: 'actor', header: 'By', render: (m: Movement) => <span className="text-xs text-surface-700">{m.actorName}</span> },
    { key: 'status', header: 'Status', render: (m: Movement) => (
      m.reversed ? <Badge variant="danger">Reversed</Badge> : <Badge variant="success">Active</Badge>
    )},
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Sales" description="Record inventory sold from this shop" />

      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'new' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('new')}>
          Record Sale
        </Button>
        <Button variant={tab === 'history' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('history')}>
          Sales History
        </Button>
      </div>

      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {success && <Alert variant="success" onDismiss={() => setSuccess(null)}>{success}</Alert>}

      {tab === 'new' && (
        <div className="space-y-6">
          <Card>
            <Input
              label="Sale Date & Time"
              type="datetime-local"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              hint="When the sale actually occurred"
            />
          </Card>

          <Card>
            <h3 className="text-sm font-medium text-surface-700 mb-3">Add Products</h3>
            <SearchInput value={productSearch} onChange={setProductSearch} placeholder="Search products..." />
            {productSearch && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-surface-200 divide-y divide-surface-200">
                {filteredProducts.slice(0, 10).map(p => {
                  const balance = shopBalances.find(b => b.productId === p.id);
                  return (
                    <button key={p.id} onClick={() => addLineItem(p)}
                      className="w-full px-3 py-2 text-left hover:bg-white flex items-center justify-between text-sm">
                      <span className="text-surface-800">{p.name}</span>
                      <span className="text-xs text-surface-400">{balance ? `${balance.quantity} in stock` : '0 in stock'}</span>
                    </button>
                  );
                })}
                {filteredProducts.length === 0 && <div className="px-3 py-2 text-sm text-surface-400">No products found</div>}
              </div>
            )}
          </Card>

          {lineItems.length > 0 && (
            <Card>
              <h3 className="text-sm font-medium text-surface-700 mb-3">Sale Items</h3>
              <div className="space-y-3">
                {lineItems.map((li, idx) => {
                  const balance = shopBalances.find(b => b.productId === li.productId);
                  return (
                    <div key={li.productId} className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-surface-900 truncate">{li.productName}</p>
                        <p className="text-xs text-surface-400">In stock: {balance?.quantity ?? 0}</p>
                      </div>
                      <Input type="number" min={1} max={balance?.quantity || 999999}
                        value={li.quantity} onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 1)}
                        className="w-24 text-center" />
                      <button onClick={() => removeLineItem(idx)} className="p-1.5 text-surface-400 hover:text-danger-500">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4">
                <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sale notes..." />
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={() => setConfirmOpen(true)} disabled={lineItems.length === 0}>Review &amp; Record Sale</Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="glass-card overflow-hidden">
          <DataTable columns={histColumns} data={history} keyExtractor={(m) => m.id} loading={histLoading} emptyMessage="No sales recorded yet" />
        </div>
      )}

      <ConfirmDialog open={confirmOpen} onCancel={() => setConfirmOpen(false)} onConfirm={handleSubmit}
        title="Confirm Sale" message={`Record sale of ${lineItems.length} product(s)? Stock will be deducted from this shop.`}
        confirmLabel="Record Sale" loading={submitting} />
    </div>
  );
}
