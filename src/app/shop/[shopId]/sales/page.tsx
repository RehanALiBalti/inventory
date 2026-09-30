'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useHasShopPermission } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import {
  Button,
  Input,
  Alert,
  SearchInput,
  DataTable,
  Badge,
  Modal,
  StatCard,
  LoadingSpinner,
} from '@/components/ui';
import { v4 as uuidv4 } from 'uuid';

interface ProductOption {
  id: string;
  name: string;
  sku: string;
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
  lineItems: { productName: string; quantity: number }[];
  actorName: string;
  recordedAt: string;
  occurredAt: string;
  reversed: boolean;
  notes?: string;
}

export default function SalesPage() {
  const params = useParams();
  const shopId = params.shopId as string;
  const canSell = useHasShopPermission(shopId, 'recordSale');

  // Main data states
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [shopBalances, setShopBalances] = useState<Balance[]>([]);
  const [history, setHistory] = useState<Movement[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  // Notifications
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Table filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'reversed'>('all');

  // Modal & Form states
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 16));
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [shopId]);

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
    const res = await apiFetch<Movement[]>(`/api/stock/movements?shopId=${shopId}&type=sale&limit=50`);
    if (res.success && res.data) setHistory(res.data);
    setHistLoading(false);
  };

  // Open modal and reset fields
  const handleOpenModal = () => {
    setLineItems([]);
    setNotes('');
    setProductSearch('');
    setModalError(null);
    setSaleDate(new Date().toISOString().slice(0, 16));
    setRecordModalOpen(true);
  };

  // Line item handlers
  const addLineItem = (p: ProductOption) => {
    if (lineItems.find((li) => li.productId === p.id)) return;
    const balance = shopBalances.find((b) => b.productId === p.id);
    const currentStock = balance?.quantity ?? 0;

    if (currentStock <= 0) {
      setModalError(`Cannot add "${p.name}" because it is out of stock in this shop.`);
      return;
    }

    setModalError(null);
    setLineItems([...lineItems, { productId: p.id, productName: p.name, quantity: 1 }]);
    setProductSearch('');
  };

  const updateQuantity = (idx: number, qty: number) => {
    const item = lineItems[idx];
    const balance = shopBalances.find((b) => b.productId === item.productId);
    const maxQty = balance?.quantity ?? 999999;

    const updated = [...lineItems];
    const finalQty = Math.max(1, Math.min(qty, maxQty));
    updated[idx] = { ...updated[idx], quantity: finalQty };
    setLineItems(updated);
  };

  const removeLineItem = (idx: number) => {
    setLineItems(lineItems.filter((_, i) => i !== idx));
  };

  // Submit sale handler
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (lineItems.length === 0) {
      setModalError('Please add at least one product to record the sale.');
      return;
    }

    // Check stock availability
    for (const item of lineItems) {
      const balance = shopBalances.find((b) => b.productId === item.productId);
      const available = balance?.quantity ?? 0;
      if (item.quantity > available) {
        setModalError(
          `Insufficient stock for "${item.productName}". Available: ${available}, requested: ${item.quantity}.`
        );
        return;
      }
    }

    setSubmitting(true);
    setModalError(null);
    setError(null);

    const res = await apiFetch('/api/stock/sale', {
      method: 'POST',
      body: JSON.stringify({
        shopId,
        requestKey: uuidv4(),
        lineItems: lineItems.map((li) => ({ productId: li.productId, quantity: li.quantity })),
        occurredAt: new Date(saleDate).toISOString(),
        notes: notes.trim() || undefined,
      }),
    });

    if (res.success) {
      setSuccess('Sale recorded successfully! Stock deducted from shop inventory.');
      setRecordModalOpen(false);
      // Reload balances & history
      const balRes = await apiFetch<Balance[]>(`/api/stock/balances?shopId=${shopId}&locationType=shop`);
      if (balRes.success && balRes.data) setShopBalances(balRes.data);
      loadHistory();
    } else {
      setModalError(res.error || 'Failed to record sale');
    }
    setSubmitting(false);
  };

  // Filter products for modal search
  const filteredProducts = products.filter(
    (p) =>
      (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(productSearch.toLowerCase())) &&
      !lineItems.find((li) => li.productId === p.id)
  );

  // Metrics calculation
  const totalSalesCount = history.length;
  const activeSales = history.filter((m) => !m.reversed);
  const totalUnitsSold = activeSales.reduce(
    (sum, m) => sum + (m.lineItems?.reduce((s, li) => s + (li.quantity || 0), 0) || 0),
    0
  );
  const todayStr = new Date().toDateString();
  const todaySalesCount = history.filter(
    (m) => m.occurredAt && new Date(m.occurredAt).toDateString() === todayStr
  ).length;

  // Filter history table data
  const filteredHistory = useMemo(() => {
    return history.filter((m) => {
      // Status filter
      if (statusFilter === 'active' && m.reversed) return false;
      if (statusFilter === 'reversed' && !m.reversed) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesActor = m.actorName?.toLowerCase().includes(query);
        const matchesNotes = m.notes?.toLowerCase().includes(query);
        const matchesItems = m.lineItems?.some((li) =>
          li.productName.toLowerCase().includes(query)
        );
        return matchesActor || matchesNotes || matchesItems;
      }
      return true;
    });
  }, [history, searchQuery, statusFilter]);

  // History table columns
  const histColumns = [
    {
      key: 'occurredAt',
      header: 'Sale Date',
      render: (m: Movement) => (
        <div>
          <span className="text-xs font-semibold text-surface-900">
            {m.occurredAt ? new Date(m.occurredAt).toLocaleDateString() : '-'}
          </span>
          <div className="text-[11px] text-surface-400 mt-0.5">
            entered {m.recordedAt ? new Date(m.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
          </div>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items Sold',
      render: (m: Movement) => (
        <div className="space-y-1">
          {m.lineItems?.map((li, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="font-medium text-surface-800">{li.productName}</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary-50 text-primary-600 border border-primary-200/50">
                ×{li.quantity}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'totalUnits',
      header: 'Total Units',
      render: (m: Movement) => {
        const totalQty = m.lineItems?.reduce((s, li) => s + (li.quantity || 0), 0) || 0;
        return (
          <span className="text-xs font-medium text-surface-700">
            {totalQty} {totalQty === 1 ? 'unit' : 'units'}
          </span>
        );
      },
    },
    {
      key: 'actor',
      header: 'Sold By',
      render: (m: Movement) => (
        <span className="text-xs text-surface-700 font-medium">{m.actorName || 'Staff'}</span>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (m: Movement) => (
        <span className="text-xs text-surface-500 italic max-w-xs truncate block">
          {m.notes || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (m: Movement) =>
        m.reversed ? (
          <Badge variant="danger">Reversed</Badge>
        ) : (
          <Badge variant="success">Active</Badge>
        ),
    },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      {/* Top Header with title and prominent Record Sale button */}
      <PageHeader
        title="Sales"
        description="View and record inventory sold from this shop"
        actions={
          canSell ? (
            <Button onClick={handleOpenModal} className="shadow-sm">
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Record Sale
            </Button>
          ) : undefined
        }
      />

      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {success && <Alert variant="success" onDismiss={() => setSuccess(null)}>{success}</Alert>}

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Sales"
          value={totalSalesCount}
          sublabel="Total recorded sales"
          icon={
            <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          }
        />
        <StatCard
          label="Units Sold"
          value={totalUnitsSold.toLocaleString()}
          sublabel="Active sold items"
          icon={
            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Today's Sales"
          value={todaySalesCount}
          sublabel="Sales recorded today"
          icon={
            <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex-1 max-w-md">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search sales by product, staff, or notes..."
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-surface-900 text-white'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
            }`}
          >
            All ({history.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'active'
                ? 'bg-emerald-600 text-white'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
            }`}
          >
            Active ({activeSales.length})
          </button>
          <button
            onClick={() => setStatusFilter('reversed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'reversed'
                ? 'bg-danger-600 text-white'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
            }`}
          >
            Reversed ({history.filter((m) => m.reversed).length})
          </button>
        </div>
      </div>

      {/* Sales DataTable */}
      <div className="glass-card overflow-hidden">
        <DataTable
          columns={histColumns}
          data={filteredHistory}
          keyExtractor={(m) => m.id}
          loading={histLoading}
          emptyMessage={
            searchQuery
              ? 'No sales match your search query.'
              : canSell
              ? 'No sales recorded yet. Click "Record Sale" at the top to record your first sale.'
              : 'No sales recorded yet.'
          }
        />
      </div>

      {/* Record Sale Modal */}
      <Modal
        open={recordModalOpen}
        onClose={() => setRecordModalOpen(false)}
        title="Record New Sale"
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[78vh] overflow-y-auto pr-1">
          {modalError && (
            <Alert variant="error" onDismiss={() => setModalError(null)}>
              {modalError}
            </Alert>
          )}

          {/* Sale Date & Time */}
          <div>
            <Input
              label="Sale Date & Time"
              type="datetime-local"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              hint="When this sale took place"
              required
            />
          </div>

          {/* Product Search & Quick Add */}
          <div className="border-t border-surface-200 pt-3">
            <label className="block text-xs font-semibold text-surface-700 uppercase tracking-wider mb-2">
              Add Products to Sale
            </label>
            <SearchInput
              value={productSearch}
              onChange={setProductSearch}
              placeholder="Search product by name or SKU..."
            />

            {productSearch && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-surface-200 divide-y divide-surface-100 bg-white shadow-lg">
                {filteredProducts.slice(0, 10).map((p) => {
                  const balance = shopBalances.find((b) => b.productId === p.id);
                  const currentStock = balance?.quantity ?? 0;
                  const isOutOfStock = currentStock <= 0;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addLineItem(p)}
                      disabled={isOutOfStock}
                      className={`w-full px-3 py-2.5 text-left flex items-center justify-between text-sm transition-colors ${
                        isOutOfStock
                          ? 'opacity-50 cursor-not-allowed bg-surface-50'
                          : 'hover:bg-primary-50 cursor-pointer'
                      }`}
                    >
                      <div>
                        <span className="font-medium text-surface-900">{p.name}</span>
                        <span className="text-xs font-mono text-surface-400 ml-2">{p.sku}</span>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          isOutOfStock
                            ? 'bg-danger-50 text-danger-600'
                            : 'bg-surface-100 text-surface-700'
                        }`}
                      >
                        {isOutOfStock ? 'Out of stock' : `${currentStock} in shop stock`}
                      </span>
                    </button>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <div className="px-3 py-3 text-sm text-surface-400 text-center">
                    No matching products found
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Selected Line Items */}
          <div>
            <label className="block text-xs font-semibold text-surface-700 uppercase tracking-wider mb-2">
              Selected Sale Items ({lineItems.length})
            </label>

            {lineItems.length > 0 ? (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {lineItems.map((li, idx) => {
                  const balance = shopBalances.find((b) => b.productId === li.productId);
                  const availableStock = balance?.quantity ?? 0;

                  return (
                    <div
                      key={li.productId}
                      className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl border border-surface-200/60"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-surface-900 truncate">
                          {li.productName}
                        </p>
                        <p className="text-xs text-surface-500">
                          Shop stock: <span className="font-medium text-surface-700">{availableStock}</span>
                        </p>
                      </div>

                      {/* Quantity Stepper & Input */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(idx, li.quantity - 1)}
                          disabled={li.quantity <= 1}
                          className="w-7 h-7 rounded-lg bg-white border border-surface-200 flex items-center justify-center text-surface-700 hover:bg-surface-100 disabled:opacity-40 transition-colors"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={availableStock}
                          value={li.quantity}
                          onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 1)}
                          className="w-14 text-center py-1 text-sm font-semibold bg-white border border-surface-200 rounded-lg outline-none focus:ring-1 focus:ring-primary-500"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(idx, li.quantity + 1)}
                          disabled={li.quantity >= availableStock}
                          className="w-7 h-7 rounded-lg bg-white border border-surface-200 flex items-center justify-center text-surface-700 hover:bg-surface-100 disabled:opacity-40 transition-colors"
                        >
                          +
                        </button>
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => removeLineItem(idx)}
                        className="p-1.5 text-surface-400 hover:text-danger-500 rounded-lg hover:bg-danger-50 transition-colors ml-1"
                        title="Remove product"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-surface-400 bg-surface-50 rounded-xl border border-dashed border-surface-200">
                No items added yet. Search above to add products to this sale.
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <Input
              label="Notes / Customer Info (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Cash sale, customer name, receipt #..."
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-surface-200 flex items-center justify-between">
            <div className="text-xs text-surface-500">
              {lineItems.length > 0 && (
                <span>
                  Total Units:{' '}
                  <strong className="text-surface-900">
                    {lineItems.reduce((acc, li) => acc + li.quantity, 0)}
                  </strong>
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRecordModalOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={lineItems.length === 0 || submitting}
              >
                {submitting ? (
                  <div className="flex items-center gap-2">
                    <LoadingSpinner size="sm" />
                    <span>Recording...</span>
                  </div>
                ) : (
                  'Confirm & Record Sale'
                )}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
