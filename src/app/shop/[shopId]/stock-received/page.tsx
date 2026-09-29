'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import { Button, Input, Select, Alert, Card, ConfirmDialog, SearchInput, DataTable, Badge } from '@/components/ui';
import { v4 as uuidv4 } from 'uuid';

interface ProductOption { id: string; name: string; sku: string; }
interface WarehouseData { id: string; name: string; }
interface LineItem { productId: string; productName: string; quantity: number; }
interface Movement {
  id: string; lineItems: { productName: string; quantity: number }[];
  destLocationName: string; actorName: string; recordedAt: string; occurredAt: string; reversed: boolean; notes?: string;
}

export default function AdminStockReceivedPage() {
  const params = useParams();
  const shopId = params.shopId as string;
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [selectedWh, setSelectedWh] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 16));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [history, setHistory] = useState<Movement[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [tab, setTab] = useState<'new' | 'history'>('new');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [pRes, wRes] = await Promise.all([
      apiFetch<ProductOption[]>(`/api/products?shopId=${shopId}`),
      apiFetch<WarehouseData[]>(`/api/warehouses?shopId=${shopId}`)
    ]);
    if (pRes.success && pRes.data) setProducts(pRes.data);
    if (wRes.success && wRes.data) setWarehouses(wRes.data);
    loadHistory();
  };

  const loadHistory = async () => {
    setHistLoading(true);
    const res = await apiFetch<Movement[]>(`/api/stock/movements?type=stock_received&limit=30&shopId=${shopId}`);
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

    const res = await apiFetch('/api/stock/receive', {
      method: 'POST',
      body: JSON.stringify({
        shopId,
        warehouseId: selectedWh,
        requestKey: uuidv4(),
        lineItems: lineItems.map(li => ({ productId: li.productId, quantity: li.quantity })),
        occurredAt: new Date(occurredAt).toISOString(),
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    });

    if (res.success) {
      setSuccess('Stock received successfully!');
      setLineItems([]);
      setReference('');
      setNotes('');
      setConfirmOpen(false);
      loadHistory();
    } else {
      setError(res.error || 'Failed to record stock received');
      setConfirmOpen(false);
    }
    setSubmitting(false);
  };

  const filteredProducts = products.filter(p =>
    (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku.toLowerCase().includes(productSearch.toLowerCase())) &&
    !lineItems.find(li => li.productId === p.id)
  );

  const histColumns = [
    { key: 'occurredAt', header: 'Receive Date', render: (m: Movement) => (
      <div>
        <span className="text-xs text-surface-800">{m.occurredAt ? new Date(m.occurredAt).toLocaleDateString() : '-'}</span>
        <span className="text-[10px] text-surface-400 ml-2">entered {m.recordedAt ? new Date(m.recordedAt).toLocaleString() : '-'}</span>
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
    { key: 'dest', header: 'Warehouse', render: (m: Movement) => <span className="text-xs text-surface-700">{m.destLocationName}</span> },
    { key: 'actor', header: 'By', render: (m: Movement) => <span className="text-xs text-surface-400">{m.actorName}</span> },
    { key: 'status', header: 'Status', render: (m: Movement) => (
      m.reversed ? <Badge variant="danger">Reversed</Badge> : <Badge variant="success">Active</Badge>
    )},
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Receive Stock" description="Record incoming stock to a warehouse" />

      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'new' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('new')}>New Receipt</Button>
        <Button variant={tab === 'history' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('history')}>Receipt History</Button>
      </div>

      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {success && <Alert variant="success" onDismiss={() => setSuccess(null)}>{success}</Alert>}

      {tab === 'new' && (
        <div className="space-y-6">
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="Destination Warehouse" value={selectedWh} onChange={e => setSelectedWh(e.target.value)}
                options={warehouses.map(w => ({ value: w.id, label: w.name }))} placeholder="Select warehouse" />
              <Input label="Receipt Date & Time" type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} />
              <Input label="Reference (e.g. PO Number)" value={reference} onChange={e => setReference(e.target.value)} />
            </div>
          </Card>

          {selectedWh && (
            <Card>
              <h3 className="text-sm font-medium text-surface-700 mb-3">Add Products</h3>
              <SearchInput value={productSearch} onChange={setProductSearch} placeholder="Search products..." />
              {productSearch && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-surface-200 divide-y divide-surface-200">
                  {filteredProducts.slice(0, 10).map(p => (
                    <button key={p.id} onClick={() => addLineItem(p)} className="w-full px-3 py-2 text-left hover:bg-white text-sm">
                      <span className="text-surface-800">{p.name}</span>
                    </button>
                  ))}
                  {filteredProducts.length === 0 && <div className="px-3 py-2 text-sm text-surface-400">No products found</div>}
                </div>
              )}
            </Card>
          )}

          {lineItems.length > 0 && (
            <Card>
              <h3 className="text-sm font-medium text-surface-700 mb-3">Items Received</h3>
              <div className="space-y-3">
                {lineItems.map((li, idx) => (
                  <div key={li.productId} className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl">
                    <p className="flex-1 text-sm font-medium text-surface-900 truncate">{li.productName}</p>
                    <Input type="number" min={1} value={li.quantity} onChange={e => updateQuantity(idx, parseInt(e.target.value) || 1)} className="w-24 text-center" />
                    <button onClick={() => removeLineItem(idx)} className="p-1.5 text-surface-400 hover:text-danger-500">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Input label="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Receipt notes..." />
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={() => setConfirmOpen(true)} disabled={lineItems.length === 0}>Review & Receive</Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="glass-card overflow-hidden">
          <DataTable columns={histColumns} data={history} keyExtractor={m => m.id} loading={histLoading} emptyMessage="No stock received yet" />
        </div>
      )}

      <ConfirmDialog open={confirmOpen} onCancel={() => setConfirmOpen(false)} onConfirm={handleSubmit}
        title="Confirm Receipt" message={`Record ${lineItems.length} product(s) as received into warehouse?`}
        confirmLabel="Receive Stock" loading={submitting} />
    </div>
  );
}
