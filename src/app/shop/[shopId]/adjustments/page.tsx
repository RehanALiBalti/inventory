'use client';

import React, { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Input,
  Pagination,
  SearchInput,
  Select,
  Textarea,
} from '@/components/ui';
import { v4 as uuidv4 } from 'uuid';
import { ReverseModal } from '@/components/stock/ReverseModal';

interface ProductOption {
  id: string;
  name: string;
  sku: string;
}

interface WarehouseData {
  id: string;
  name: string;
}

interface Balance {
  productId: string;
  quantity: number;
}

interface AdjustLine {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  direction: 'increase' | 'decrease';
  available: number;
}

interface ReturnLine {
  productId: string;
  productName: string;
  quantity: number;
  available: number;
}

interface Movement {
  id: string;
  type: string;
  lineItems: { productName: string; quantity: number; direction?: 'increase' | 'decrease' }[];
  sourceLocationName?: string;
  destLocationName?: string;
  actorName: string;
  recordedAt: string;
  notes?: string;
  reversed: boolean;
}

type Tab = 'adjust' | 'return' | 'history';

export default function StockControlPage() {
  const params = useParams();
  const pathname = usePathname();
  const shopId = params.shopId as string;
  const warehouseSide = pathname.endsWith('/warehouse-adjustments');
  const { userRecord } = useAuth();
  const isAdmin = userRecord?.role === 'admin';

  const [tab, setTab] = useState<Tab>('adjust');
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [warehouseId, setWarehouseId] = useState('');
  const [warehouseBalances, setWarehouseBalances] = useState<Balance[]>([]);
  const [adjustSearch, setAdjustSearch] = useState('');
  const [adjustLines, setAdjustLines] = useState<AdjustLine[]>([]);
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustConfirm, setAdjustConfirm] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const [returnWarehouse, setReturnWarehouse] = useState('');
  const [shopBalances, setShopBalances] = useState<Balance[]>([]);
  const [returnSearch, setReturnSearch] = useState('');
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [returnNotes, setReturnNotes] = useState('');
  const [returnConfirm, setReturnConfirm] = useState(false);
  const [returning, setReturning] = useState(false);

  const [history, setHistory] = useState<Movement[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histPage, setHistPage] = useState(1);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<Movement | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    loadBase();
  }, [shopId, isAdmin]);

  const loadBase = async () => {
    const [prodRes, whRes, shopBalRes] = await Promise.all([
      apiFetch<ProductOption[]>(`/api/products?shopId=${shopId}`),
      apiFetch<WarehouseData[]>(`/api/warehouses?shopId=${shopId}`),
      apiFetch<Balance[]>(`/api/stock/balances?shopId=${shopId}&locationId=${shopId}&locationType=shop`),
    ]);
    if (prodRes.success && prodRes.data) setProducts(prodRes.data);
    if (whRes.success && whRes.data) {
      setWarehouses(whRes.data);
      if (whRes.data[0]) {
        setWarehouseId((current) => current || whRes.data![0].id);
      }
      if (whRes.data.length === 1) setReturnWarehouse(whRes.data[0].id);
    }
    if (shopBalRes.success && shopBalRes.data) setShopBalances(shopBalRes.data);
  };

  useEffect(() => {
    if (!isAdmin || !warehouseSide || !warehouseId) return;
    loadWarehouseBalances();
  }, [isAdmin, warehouseSide, warehouseId, shopId]);

  useEffect(() => {
    if (warehouseSide && tab === 'return') setTab('adjust');
  }, [warehouseSide, tab]);

  const loadWarehouseBalances = async () => {
    const res = await apiFetch<Balance[]>(
      `/api/stock/balances?shopId=${shopId}&locationId=${warehouseId}&locationType=warehouse`
    );
    if (res.success && res.data) setWarehouseBalances(res.data);
  };

  const loadHistory = async () => {
    setHistLoading(true);
    const [adjustRes, returnRes] = await Promise.all([
      apiFetch<Movement[]>(`/api/stock/movements?shopId=${shopId}&type=adjustment&limit=50`),
      apiFetch<Movement[]>(`/api/stock/movements?shopId=${shopId}&type=shop_to_warehouse_transfer&limit=50`),
    ]);
    const merged = [
      ...(adjustRes.data || []),
      ...(returnRes.data || []),
    ].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
    setHistory(merged);
    setHistLoading(false);
  };

  const qtyFor = (balances: Balance[], productId: string) =>
    balances.find((b) => b.productId === productId)?.quantity ?? 0;

  const adjustBalances = warehouseSide ? warehouseBalances : shopBalances;
  const placeLabel = warehouseSide ? 'in warehouse' : 'in shop';

  const addAdjustLine = (product: ProductOption) => {
    if (adjustLines.some((line) => line.productId === product.id)) return;
    setAdjustLines([
      ...adjustLines,
      {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: 1,
        direction: 'increase',
        available: qtyFor(adjustBalances, product.id),
      },
    ]);
    setAdjustSearch('');
  };

  const updateAdjustLine = (idx: number, patch: Partial<AdjustLine>) => {
    setAdjustLines(adjustLines.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  };

  const addReturnLine = (product: ProductOption) => {
    if (returnLines.some((line) => line.productId === product.id)) return;
    const available = qtyFor(shopBalances, product.id);
    if (available <= 0) return;
    setReturnLines([
      ...returnLines,
      { productId: product.id, productName: product.name, quantity: 1, available },
    ]);
    setReturnSearch('');
  };

  const refreshAfterChange = async () => {
    await Promise.all([loadBase(), warehouseSide ? loadWarehouseBalances() : Promise.resolve(), loadHistory()]);
  };

  const submitAdjust = async () => {
    setAdjusting(true);
    setError(null);

    const res = await apiFetch<{ movementId: string }>('/api/stock/adjust', {
      method: 'POST',
      body: JSON.stringify({
        shopId,
        locationId: warehouseSide ? warehouseId : shopId,
        locationType: warehouseSide ? 'warehouse' : 'shop',
        requestKey: uuidv4(),
        notes: adjustNotes.trim(),
        lineItems: adjustLines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          direction: line.direction,
        })),
      }),
    });

    if (res.success) {
      setSuccess('Stock adjustment saved.');
      setAdjustLines([]);
      setAdjustNotes('');
      setAdjustConfirm(false);
      await refreshAfterChange();
    } else {
      setError(res.error || 'Adjustment failed');
      setAdjustConfirm(false);
    }
    setAdjusting(false);
  };

  const submitReturn = async () => {
    setReturning(true);
    setError(null);
    const res = await apiFetch<{ movementId: string }>('/api/stock/return', {
      method: 'POST',
      body: JSON.stringify({
        sourceShopId: shopId,
        destWarehouseId: returnWarehouse,
        requestKey: uuidv4(),
        notes: returnNotes.trim() || undefined,
        lineItems: returnLines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
      }),
    });

    if (res.success) {
      setSuccess('Stock returned to the warehouse.');
      setReturnLines([]);
      setReturnNotes('');
      setReturnConfirm(false);
      await refreshAfterChange();
    } else {
      setError(res.error || 'Return failed');
      setReturnConfirm(false);
    }
    setReturning(false);
  };

  const openAdjustConfirm = () => {
    if (warehouseSide && !warehouseId) {
      setError('Select the warehouse to adjust.');
      return;
    }
    if (adjustLines.length === 0) {
      setError('Add at least one product to adjust.');
      return;
    }
    if (!adjustNotes.trim()) {
      setError('A reason is required for every stock adjustment.');
      return;
    }
    for (const line of adjustLines) {
      const available = qtyFor(adjustBalances, line.productId);
      if (line.direction === 'decrease' && line.quantity > available) {
        setError(`${line.productName} only has ${available} on hand. Decrease cannot go below zero.`);
        return;
      }
    }
    setError(null);
    setAdjustConfirm(true);
  };

  const openReturnConfirm = () => {
    if (!returnWarehouse) {
      setError('Select the warehouse that should receive the stock.');
      return;
    }
    if (returnLines.length === 0) {
      setError('Add at least one product to return.');
      return;
    }
    for (const line of returnLines) {
      const available = qtyFor(shopBalances, line.productId);
      if (line.quantity > available) {
        setError(`${line.productName} only has ${available} in the shop.`);
        return;
      }
    }
    setError(null);
    setReturnConfirm(true);
  };

  if (!isAdmin) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Stock Control" />
        <EmptyState
          title="Admin only"
          description="Adjusting stock and returning shop stock to a warehouse are limited to administrators."
        />
      </div>
    );
  }

  const adjustMatches = products.filter((p) => {
    const q = adjustSearch.toLowerCase();
    return (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      && !adjustLines.some((line) => line.productId === p.id);
  });

  const returnMatches = products.filter((p) => {
    const q = returnSearch.toLowerCase();
    return (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      && !returnLines.some((line) => line.productId === p.id);
  });

  const historyPages = Math.max(1, Math.ceil(history.length / 10));
  const histColumns = [
    { key: 'recordedAt', header: 'Date', render: (m: Movement) => (
      <span className="text-xs text-surface-400">
        {m.recordedAt ? new Date(m.recordedAt).toLocaleString() : '-'}
      </span>
    )},
    { key: 'type', header: 'Type', render: (m: Movement) => (
      <Badge variant={m.type === 'adjustment' ? 'warning' : 'info'}>
        {m.type === 'adjustment' ? 'Adjustment' : 'Return to warehouse'}
      </Badge>
    )},
    { key: 'where', header: 'Location', render: (m: Movement) => (
      <span className="text-xs text-surface-700">
        {m.type === 'adjustment'
          ? m.sourceLocationName
          : `${m.sourceLocationName} → ${m.destLocationName}`}
      </span>
    )},
    { key: 'items', header: 'Items', render: (m: Movement) => (
      <div className="space-y-0.5">
        {m.lineItems?.map((li, i) => (
          <div key={i} className="text-xs">
            <span className="text-surface-800">{li.productName}</span>
            <span className="text-primary-500 font-semibold ml-1">
              {li.direction === 'increase' ? '+' : li.direction === 'decrease' ? '−' : '×'}
              {li.quantity}
            </span>
          </div>
        ))}
      </div>
    )},
    { key: 'status', header: 'Status', render: (m: Movement) => (
      m.reversed ? <Badge variant="danger">Reversed</Badge> : <Badge variant="success">Active</Badge>
    )},
    { key: 'actions', header: '', render: (m: Movement) => (
      !m.reversed ? (
        <button
          onClick={() => { setSelectedMovement(m); setReverseOpen(true); }}
          className="text-xs font-medium text-danger-600 hover:underline"
        >
          Reverse
        </button>
      ) : null
    )},
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={warehouseSide ? 'Warehouse Stock Control' : 'Stock Control'}
        description={
          warehouseSide
            ? 'Correct the quantity stored in a warehouse. Admins only.'
            : 'Correct shop stock, or send shop stock back to a warehouse. Admins only.'
        }
      />

      <div className="flex flex-wrap gap-2 mb-6">
        <Button variant={tab === 'adjust' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('adjust')}>
          Adjust stock
        </Button>
        {!warehouseSide && (
          <Button variant={tab === 'return' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('return')}>
            Return to warehouse
          </Button>
        )}
        <Button
          variant={tab === 'history' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => { setTab('history'); setHistPage(1); loadHistory(); }}
        >
          History
        </Button>
      </div>

      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {success && <Alert variant="success" onDismiss={() => setSuccess(null)}>{success}</Alert>}

      {tab === 'adjust' && (
        <div className="space-y-6">
          <Card>
            {warehouseSide ? (
              <Select
                label="Warehouse"
                value={warehouseId}
                onChange={(e) => {
                  setWarehouseId(e.target.value);
                  setAdjustLines([]);
                }}
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                placeholder="Select warehouse"
              />
            ) : (
              <p className="text-sm text-surface-700">
                Adjustments change this shop&apos;s stock only.
              </p>
            )}
            <p className="text-xs text-surface-400 mt-3">
              {warehouseSide
                ? 'This changes the warehouse count in place. It does not move stock into the shop.'
                : 'This changes the shop count in place. Use Return to warehouse to move units out of the shop.'}
            </p>
          </Card>

          {warehouseSide && warehouses.length === 0 && (
            <Card>
              <p className="text-sm text-surface-600">This shop has no warehouse yet. Add one under Warehouses first.</p>
            </Card>
          )}

          {(!warehouseSide || warehouseId) && (
          <>
          <Card>
            <h3 className="text-sm font-medium text-surface-700 mb-3">Add products</h3>
            <SearchInput value={adjustSearch} onChange={setAdjustSearch} placeholder="Search products..." />
            {adjustSearch && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-surface-200 divide-y divide-surface-200">
                {adjustMatches.slice(0, 10).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addAdjustLine(p)}
                    className="w-full px-3 py-2 text-left hover:bg-white flex items-center justify-between text-sm"
                  >
                    <span className="text-surface-800">{p.name}</span>
                    <span className="text-xs text-surface-400">{qtyFor(adjustBalances, p.id)} {placeLabel}</span>
                  </button>
                ))}
                {adjustMatches.length === 0 && (
                  <div className="px-3 py-2 text-sm text-surface-400">No products found</div>
                )}
              </div>
            )}
          </Card>

          {adjustLines.length > 0 && (
            <Card>
              <h3 className="text-sm font-medium text-surface-700 mb-3">Adjustment</h3>
              <div className="space-y-3">
                {adjustLines.map((line, idx) => {
                  const available = qtyFor(adjustBalances, line.productId);
                  return (
                    <div key={line.productId} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-surface-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-surface-900 truncate">{line.productName}</p>
                        <p className="text-xs text-surface-400">{warehouseSide ? 'In warehouse' : 'In shop'}: {available}</p>
                      </div>
                      <Select
                        value={line.direction}
                        onChange={(e) => updateAdjustLine(idx, { direction: e.target.value as AdjustLine['direction'] })}
                        options={[
                          { value: 'increase', label: 'Increase' },
                          { value: 'decrease', label: 'Decrease' },
                        ]}
                        className="sm:w-36"
                      />
                      <Input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => updateAdjustLine(idx, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className="sm:w-24 text-center"
                      />
                      <button
                        onClick={() => setAdjustLines(adjustLines.filter((_, i) => i !== idx))}
                        className="p-1.5 text-surface-400 hover:text-danger-500"
                        aria-label="Remove product"
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
                <Textarea
                  label="Reason"
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="Why is this count being changed?"
                />
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={openAdjustConfirm}>Review adjustment</Button>
              </div>
            </Card>
          )}
          </>
          )}
        </div>
      )}

      {tab === 'return' && !warehouseSide && (
        <div className="space-y-6">
          <Card>
            <Select
              label="Destination warehouse"
              value={returnWarehouse}
              onChange={(e) => setReturnWarehouse(e.target.value)}
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              placeholder="Select warehouse"
            />
            <p className="text-xs text-surface-400 mt-3">
              This deducts the shop and adds the same quantity to the warehouse. You can only return stock the shop currently has.
            </p>
          </Card>

          {returnWarehouse && (
            <Card>
              <h3 className="text-sm font-medium text-surface-700 mb-3">Shop products</h3>
              <SearchInput value={returnSearch} onChange={setReturnSearch} placeholder="Search shop stock..." />
              {returnSearch && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-surface-200 divide-y divide-surface-200">
                  {returnMatches.slice(0, 10).map((p) => {
                    const available = qtyFor(shopBalances, p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => addReturnLine(p)}
                        disabled={available <= 0}
                        className="w-full px-3 py-2 text-left hover:bg-white flex items-center justify-between text-sm disabled:opacity-50"
                      >
                        <span className="text-surface-800">{p.name}</span>
                        <span className="text-xs text-surface-400">{available} in shop</span>
                      </button>
                    );
                  })}
                  {returnMatches.length === 0 && (
                    <div className="px-3 py-2 text-sm text-surface-400">No products found</div>
                  )}
                </div>
              )}
            </Card>
          )}

          {returnLines.length > 0 && (
            <Card>
              <h3 className="text-sm font-medium text-surface-700 mb-3">Return items</h3>
              <div className="space-y-3">
                {returnLines.map((line, idx) => {
                  const available = qtyFor(shopBalances, line.productId);
                  return (
                    <div key={line.productId} className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-surface-900 truncate">{line.productName}</p>
                        <p className="text-xs text-surface-400">In shop: {available}</p>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={available}
                        value={line.quantity}
                        onChange={(e) => {
                          const next = Math.max(1, parseInt(e.target.value, 10) || 1);
                          setReturnLines(returnLines.map((row, i) => i === idx ? { ...row, quantity: next } : row));
                        }}
                        className="w-24 text-center"
                      />
                      <button
                        onClick={() => setReturnLines(returnLines.filter((_, i) => i !== idx))}
                        className="p-1.5 text-surface-400 hover:text-danger-500"
                        aria-label="Remove product"
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
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Return notes..."
                />
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={openReturnConfirm}>Review return</Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="glass-card overflow-hidden">
          <DataTable
            columns={histColumns}
            data={history.slice((Math.min(histPage, historyPages) - 1) * 10, Math.min(histPage, historyPages) * 10)}
            keyExtractor={(m) => m.id}
            loading={histLoading}
            emptyMessage="No adjustments or returns yet"
          />
          <Pagination page={Math.min(histPage, historyPages)} totalPages={historyPages} onPageChange={setHistPage} />
        </div>
      )}

      <ConfirmDialog
        open={adjustConfirm}
        onCancel={() => setAdjustConfirm(false)}
        onConfirm={submitAdjust}
        title="Confirm adjustment"
        message={
          warehouseSide
            ? `Update ${adjustLines.length} product(s) in this warehouse? Shop stock stays unchanged.`
            : `Update ${adjustLines.length} product(s) in this shop? Warehouse stock stays unchanged.`
        }
        confirmLabel="Save adjustment"
        loading={adjusting}
      />

      <ConfirmDialog
        open={returnConfirm}
        onCancel={() => setReturnConfirm(false)}
        onConfirm={submitReturn}
        title="Confirm return"
        message={`Move ${returnLines.length} product(s) from the shop back to the warehouse?`}
        confirmLabel="Return stock"
        loading={returning}
      />

      <ReverseModal
        open={reverseOpen}
        onClose={() => setReverseOpen(false)}
        movement={selectedMovement}
        onSuccess={() => {
          setSuccess('Transaction reversed. Stock has been restored.');
          refreshAfterChange();
        }}
      />
    </div>
  );
}
