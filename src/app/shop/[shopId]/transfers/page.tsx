'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth, useHasShopPermission } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import { Button, Input, Select, Alert, Card, ConfirmDialog, SearchInput, EmptyState, DataTable, Badge } from '@/components/ui';
import { v4 as uuidv4 } from 'uuid';

interface ProductOption {
  id: string;
  name: string;
  sku: string;
}

interface ShopData {
  id: string;
  name: string;
  linkedWarehouseIds: string[];
}

interface WarehouseData {
  id: string;
  name: string;
}

interface LineItem {
  productId: string;
  productName: string;
  quantity: number;
}

interface Balance {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
}

interface Movement {
  id: string;
  type: string;
  lineItems: { productName: string; quantity: number }[];
  sourceLocationName: string;
  destLocationName: string;
  actorName: string;
  recordedAt: string;
  reversed: boolean;
}

export default function TransfersPage() {
  const params = useParams();
  const shopId = params.shopId as string;
  const { userRecord } = useAuth();
  const canTransfer = useHasShopPermission(shopId, 'transfer');

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [shop, setShop] = useState<ShopData | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [warehouseBalances, setWarehouseBalances] = useState<Balance[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<Movement[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [tab, setTab] = useState<'new' | 'history'>('new');

  useEffect(() => {
    loadData();
  }, [shopId]);

  const loadData = async () => {
    setLoading(true);
    const [prodRes, whRes] = await Promise.all([
      apiFetch<ProductOption[]>(`/api/products?shopId=${shopId}`),
      apiFetch<WarehouseData[]>(`/api/warehouses?shopId=${shopId}`),
    ]);

    if (prodRes.success && prodRes.data) setProducts(prodRes.data);
    if (whRes.success && whRes.data) setWarehouses(whRes.data);
    setLoading(false);

    // Load history
    loadHistory();
  };

  const loadHistory = async () => {
    setHistLoading(true);
    const res = await apiFetch<Movement[]>(`/api/stock/movements?shopId=${shopId}&type=warehouse_to_shop_transfer&limit=30`);
    if (res.success && res.data) setHistory(res.data);
    setHistLoading(false);
  };

  // When warehouse selected, load its balances
  useEffect(() => {
    if (!selectedWarehouse) {
      setWarehouseBalances([]);
      return;
    }
    loadWarehouseBalances();
  }, [selectedWarehouse]);

  const loadWarehouseBalances = async () => {
    const res = await apiFetch<Balance[]>(
      `/api/stock/balances?shopId=${shopId}&locationId=${selectedWarehouse}&locationType=warehouse`
    );
    if (res.success && res.data) setWarehouseBalances(res.data);
  };

  const linkedWarehouses = warehouses;

  // Auto-select warehouse if only one
  useEffect(() => {
    if (linkedWarehouses.length === 1 && !selectedWarehouse) {
      setSelectedWarehouse(linkedWarehouses[0].id);
    }
  }, [linkedWarehouses]);

  const addLineItem = (product: ProductOption) => {
    if (lineItems.find(li => li.productId === product.id)) return;
    setLineItems([...lineItems, { productId: product.id, productName: product.name, quantity: 1 }]);
    setProductSearch('');
  };

  const updateQuantity = (idx: number, qty: number) => {
    const updated = [...lineItems];
    updated[idx] = { ...updated[idx], quantity: Math.max(1, qty) };
    setLineItems(updated);
  };

  const removeLineItem = (idx: number) => {
    setLineItems(lineItems.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const res = await apiFetch('/api/stock/transfer', {
      method: 'POST',
      body: JSON.stringify({
        sourceWarehouseId: selectedWarehouse,
        destShopId: shopId,
        requestKey: uuidv4(),
        lineItems: lineItems.map(li => ({ productId: li.productId, quantity: li.quantity })),
        notes: notes.trim() || undefined,
      }),
    });

    if (res.success) {
      setSuccess('Transfer completed successfully!');
      setLineItems([]);
      setNotes('');
      setConfirmOpen(false);
      loadWarehouseBalances();
      loadHistory();
    } else {
      setError(res.error || 'Transfer failed');
      setConfirmOpen(false);
    }
    setSubmitting(false);
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku.toLowerCase().includes(productSearch.toLowerCase())
  ).filter(p => !lineItems.find(li => li.productId === p.id));

  if (!canTransfer && tab === 'new') {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Transfers" />
        <EmptyState
          title="No Transfer Permission"
          description="You don't have permission to transfer stock into this shop."
          icon={
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          }
        />
        <div className="mt-4">
          <Button variant="secondary" onClick={() => setTab('history')}>View Transfer History</Button>
        </div>
      </div>
    );
  }

  const histColumns = [
    { key: 'recordedAt', header: 'Date', render: (m: Movement) => (
      <span className="text-xs text-surface-400">{m.recordedAt ? new Date(m.recordedAt).toLocaleString() : '-'}</span>
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
    { key: 'from', header: 'From', render: (m: Movement) => <span className="text-xs text-surface-400">{m.sourceLocationName}</span> },
    { key: 'actor', header: 'By', render: (m: Movement) => <span className="text-xs text-surface-700">{m.actorName}</span> },
    { key: 'status', header: 'Status', render: (m: Movement) => (
      m.reversed ? <Badge variant="danger">Reversed</Badge> : <Badge variant="success">Active</Badge>
    )},
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Transfers" description="Transfer stock from warehouse to this shop" />

      {/* Tab selector */}
      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'new' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('new')}>
          New Transfer
        </Button>
        <Button variant={tab === 'history' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('history')}>
          Transfer History
        </Button>
      </div>

      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {success && <Alert variant="success" onDismiss={() => setSuccess(null)}>{success}</Alert>}

      {tab === 'new' && (
        <div className="space-y-6">
          {/* Warehouse selection */}
          <Card>
            <Select
              label="Source Warehouse"
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              options={linkedWarehouses.map(w => ({ value: w.id, label: w.name }))}
              placeholder="Select warehouse"
            />
          </Card>

          {/* Product selection */}
          {selectedWarehouse && (
            <Card>
              <h3 className="text-sm font-medium text-surface-700 mb-3">Add Products</h3>
              <SearchInput
                value={productSearch}
                onChange={setProductSearch}
                placeholder="Search products to add..."
              />
              {productSearch && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-surface-200 divide-y divide-surface-200">
                  {filteredProducts.slice(0, 10).map(p => {
                    const balance = warehouseBalances.find(b => b.productId === p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => addLineItem(p)}
                        className="w-full px-3 py-2 text-left hover:bg-white flex items-center justify-between text-sm"
                      >
                        <span className="text-surface-800">{p.name}</span>
                        <span className="text-xs text-surface-400">
                          {balance ? `${balance.quantity} avail.` : '0 avail.'}
                        </span>
                      </button>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <div className="px-3 py-2 text-sm text-surface-400">No products found</div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Line items */}
          {lineItems.length > 0 && (
            <Card>
              <h3 className="text-sm font-medium text-surface-700 mb-3">Transfer Items</h3>
              <div className="space-y-3">
                {lineItems.map((li, idx) => {
                  const balance = warehouseBalances.find(b => b.productId === li.productId);
                  return (
                    <div key={li.productId} className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-surface-900 truncate">{li.productName}</p>
                        <p className="text-xs text-surface-400">
                          Available: {balance?.quantity ?? 0}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={balance?.quantity || 999999}
                        value={li.quantity}
                        onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 1)}
                        className="w-24 text-center"
                      />
                      <button
                        onClick={() => removeLineItem(idx)}
                        className="p-1.5 text-surface-400 hover:text-danger-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4">
                <Input
                  label="Notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Transfer notes..."
                />
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={() => setConfirmOpen(true)} disabled={lineItems.length === 0}>
                  Review &amp; Transfer
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="glass-card overflow-hidden">
          <DataTable
            columns={histColumns}
            data={history}
            keyExtractor={(m) => m.id}
            loading={histLoading}
            emptyMessage="No transfers yet"
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleSubmit}
        title="Confirm Transfer"
        message={`Transfer ${lineItems.length} product(s) from warehouse to shop? This will deduct warehouse stock and add to shop stock.`}
        confirmLabel="Confirm Transfer"
        loading={submitting}
      />
    </div>
  );
}
