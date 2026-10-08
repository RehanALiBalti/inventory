'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import {
  Button,
  Input,
  Select,
  Alert,
  Card,
  Modal,
  ConfirmDialog,
  SearchInput,
  DataTable,
  Badge,
  StatCard,
  LoadingSpinner,
  Pagination
} from '@/components/ui';
import { v4 as uuidv4 } from 'uuid';

interface ProductSummaryItem {
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  active: boolean;
  totalReceived: number;
  warehouseStock: number;
  shopStock: number;
  transferredToShop: number;
  totalSold: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
  lowStockThreshold: number;
}

interface WarehouseData {
  id: string;
  name: string;
}

interface SummaryResponse {
  warehouses: WarehouseData[];
  metrics: {
    totalWarehouseStock: number;
    totalShopStock: number;
    totalSold: number;
    totalReceived: number;
    totalProducts: number;
  };
  items: ProductSummaryItem[];
}

interface Movement {
  id: string;
  type: string;
  lineItems: { productName: string; quantity: number }[];
  sourceLocationName?: string;
  destLocationName?: string;
  actorName: string;
  recordedAt: string;
  occurredAt?: string;
  reversed: boolean;
  notes?: string;
}

interface LineItemInput {
  productId: string;
  productName: string;
  quantity: number;
  maxQuantity?: number;
}

export default function WarehouseStockPage() {
  const params = useParams();
  const shopId = params.shopId as string;
  const { userRecord } = useAuth();
  const isAdmin = userRecord?.role === 'admin';

  // Data states
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filter & Search states
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'in_warehouse' | 'low' | 'out_of_stock'>('all');
  const [viewTab, setViewTab] = useState<'inventory' | 'receipts_history' | 'transfers_history'>('inventory');

  // History states
  const [receiptsHistory, setReceiptsHistory] = useState<Movement[]>([]);
  const [transfersHistory, setTransfersHistory] = useState<Movement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [receiptPage, setReceiptPage] = useState(1);
  const [transferPage, setTransferPage] = useState(1);
  const [paneLoading, setPaneLoading] = useState(false);

  const openView = (next: 'inventory' | 'receipts_history' | 'transfers_history') => {
    if (next === viewTab) return;
    setViewTab(next);
    if (next === 'inventory') {
      setPaneLoading(true);
      window.setTimeout(() => setPaneLoading(false), 420);
    } else {
      setHistoryLoading(true);
      if (next === 'receipts_history') setReceiptPage(1);
      else setTransferPage(1);
    }
  };

  // Receive Stock Modal state
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveWh, setReceiveWh] = useState('');
  const [receiveOccurredAt, setReceiveOccurredAt] = useState(new Date().toISOString().slice(0, 16));
  const [receiveReference, setReceiveReference] = useState('');
  const [receiveNotes, setReceiveNotes] = useState('');
  const [receiveItems, setReceiveItems] = useState<LineItemInput[]>([]);
  const [receiveProdSearch, setReceiveProdSearch] = useState('');
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);

  // Transfer to Shop Modal state
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferWh, setTransferWh] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferItems, setTransferItems] = useState<LineItemInput[]>([]);
  const [transferProdSearch, setTransferProdSearch] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // Load summary data
  const loadSummary = async () => {
    setLoading(true);
    const res = await apiFetch<SummaryResponse>(`/api/stock/warehouse-summary?shopId=${shopId}`);
    if (res.success && res.data) {
      setData(res.data);
      if (res.data.warehouses.length > 0 && !receiveWh) {
        setReceiveWh(res.data.warehouses[0].id);
        setTransferWh(res.data.warehouses[0].id);
      }
    } else {
      setError(res.error || 'Failed to load warehouse inventory summary');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSummary();
  }, [shopId]);

  // Load history when tab changes
  useEffect(() => {
    if (viewTab === 'receipts_history') {
      loadReceiptsHistory();
    } else if (viewTab === 'transfers_history') {
      loadTransfersHistory();
    }
  }, [viewTab]);

  const loadReceiptsHistory = async () => {
    setHistoryLoading(true);
    const res = await apiFetch<Movement[]>(`/api/stock/movements?type=stock_received&limit=30&shopId=${shopId}`);
    if (res.success && res.data) {
      setReceiptsHistory(res.data);
    }
    setHistoryLoading(false);
  };

  const loadTransfersHistory = async () => {
    setHistoryLoading(true);
    const res = await apiFetch<Movement[]>(`/api/stock/movements?type=warehouse_to_shop_transfer&limit=30&shopId=${shopId}`);
    if (res.success && res.data) {
      setTransfersHistory(res.data);
    }
    setHistoryLoading(false);
  };

  // Filtered products for main table
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];

    return data.items.filter(item => {
      // Search match
      const q = search.toLowerCase();
      const matchSearch = item.productName.toLowerCase().includes(q) || item.productSku.toLowerCase().includes(q);
      if (!matchSearch) return false;

      // Status chip filter
      if (filterTab === 'in_warehouse') return item.warehouseStock > 0;
      if (filterTab === 'low') return item.warehouseStock > 0 && item.warehouseStock <= (item.lowStockThreshold || 10);
      if (filterTab === 'out_of_stock') return item.warehouseStock <= 0;
      return true;
    });
  }, [data?.items, search, filterTab]);

  // Quick Action: Open Receive Stock with pre-selected product
  const handleOpenReceiveWithProduct = (item: ProductSummaryItem) => {
    setReceiveItems([{ productId: item.productId, productName: item.productName, quantity: 1 }]);
    setReceiveModalOpen(true);
  };

  // Quick Action: Open Transfer with pre-selected product
  const handleOpenTransferWithProduct = (item: ProductSummaryItem) => {
    setTransferItems([
      {
        productId: item.productId,
        productName: item.productName,
        quantity: 1,
        maxQuantity: item.warehouseStock,
      },
    ]);
    setTransferModalOpen(true);
  };

  // Receive items handlers
  const addReceiveItem = (item: ProductSummaryItem) => {
    if (receiveItems.find(li => li.productId === item.productId)) return;
    setReceiveItems([...receiveItems, { productId: item.productId, productName: item.productName, quantity: 1 }]);
    setReceiveProdSearch('');
  };

  const updateReceiveQty = (idx: number, qty: number) => {
    const updated = [...receiveItems];
    updated[idx].quantity = Math.max(1, qty);
    setReceiveItems(updated);
  };

  const removeReceiveItem = (idx: number) => {
    setReceiveItems(receiveItems.filter((_, i) => i !== idx));
  };

  // Submit Receive Stock
  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveWh) {
      setError('Please select a destination warehouse');
      return;
    }
    if (receiveItems.length === 0) {
      setError('Please add at least one product to receive');
      return;
    }

    setReceiveSubmitting(true);
    setError(null);

    const res = await apiFetch('/api/stock/receive', {
      method: 'POST',
      body: JSON.stringify({
        shopId,
        warehouseId: receiveWh,
        requestKey: uuidv4(),
        lineItems: receiveItems.map(li => ({ productId: li.productId, quantity: li.quantity })),
        occurredAt: new Date(receiveOccurredAt).toISOString(),
        reference: receiveReference.trim() || undefined,
        notes: receiveNotes.trim() || undefined,
      }),
    });

    if (res.success) {
      setSuccess(`Successfully received ${receiveItems.length} product(s) into warehouse!`);
      setReceiveModalOpen(false);
      setReceiveItems([]);
      setReceiveReference('');
      setReceiveNotes('');
      loadSummary();
      if (viewTab === 'receipts_history') loadReceiptsHistory();
    } else {
      setError(res.error || 'Failed to record stock received');
    }
    setReceiveSubmitting(false);
  };

  // Transfer items handlers
  const addTransferItem = (item: ProductSummaryItem) => {
    if (transferItems.find(li => li.productId === item.productId)) return;
    setTransferItems([
      ...transferItems,
      {
        productId: item.productId,
        productName: item.productName,
        quantity: 1,
        maxQuantity: item.warehouseStock,
      },
    ]);
    setTransferProdSearch('');
  };

  const updateTransferQty = (idx: number, qty: number) => {
    const updated = [...transferItems];
    updated[idx].quantity = Math.max(1, qty);
    setTransferItems(updated);
  };

  const removeTransferItem = (idx: number) => {
    setTransferItems(transferItems.filter((_, i) => i !== idx));
  };

  // Submit Transfer
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferWh) {
      setError('Please select a source warehouse');
      return;
    }
    if (transferItems.length === 0) {
      setError('Please add at least one product to transfer');
      return;
    }

    setTransferSubmitting(true);
    setError(null);

    const res = await apiFetch('/api/stock/transfer', {
      method: 'POST',
      body: JSON.stringify({
        sourceWarehouseId: transferWh,
        destShopId: shopId,
        requestKey: uuidv4(),
        lineItems: transferItems.map(li => ({ productId: li.productId, quantity: li.quantity })),
        notes: transferNotes.trim() || undefined,
      }),
    });

    if (res.success) {
      setSuccess(`Successfully transferred ${transferItems.length} product(s) from warehouse to shop!`);
      setTransferModalOpen(false);
      setTransferItems([]);
      setTransferNotes('');
      loadSummary();
      if (viewTab === 'transfers_history') loadTransfersHistory();
    } else {
      setError(res.error || 'Failed to process transfer');
    }
    setTransferSubmitting(false);
  };

  // Data table columns
  const columns = [
    {
      key: 'product',
      header: 'Product',
      render: (item: ProductSummaryItem) => (
        <div>
          <div className="font-semibold text-surface-900 leading-tight">{item.productName}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface-100 text-surface-500">
              {item.productSku}
            </span>
            <span className="text-xs text-surface-400 capitalize">{item.unit}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'totalReceived',
      header: 'Total Received',
      render: (item: ProductSummaryItem) => (
        <div className="text-left">
          <span className="font-medium text-surface-700 text-sm">
            {item.totalReceived.toLocaleString()}
          </span>
          <span className="text-xs text-surface-400 ml-1">{item.unit}</span>
          <p className="text-[10px] text-surface-400">Total in-flow</p>
        </div>
      ),
    },
    {
      key: 'warehouseStock',
      header: 'Warehouse Available',
      render: (item: ProductSummaryItem) => (
        <div className="text-left">
          <span
            className={`font-bold text-base ${
              item.warehouseStock <= 0
                ? 'text-danger-500'
                : item.warehouseStock <= (item.lowStockThreshold || 10)
                ? 'text-warning-500'
                : 'text-primary-600'
            }`}
          >
            {item.warehouseStock.toLocaleString()}
          </span>
          <span className="text-xs text-surface-400 ml-1">{item.unit}</span>
          <p className="text-[10px] text-surface-400">In warehouse</p>
        </div>
      ),
    },
    {
      key: 'shopStock',
      header: 'In Shop',
      render: (item: ProductSummaryItem) => (
        <div className="text-left">
          <span className="font-semibold text-surface-800 text-sm">
            {item.shopStock.toLocaleString()}
          </span>
          <span className="text-xs text-surface-400 ml-1">{item.unit}</span>
          <p className="text-[10px] text-surface-400">Shop inventory</p>
        </div>
      ),
    },
    {
      key: 'totalSold',
      header: 'Total Sold',
      render: (item: ProductSummaryItem) => (
        <div className="text-left">
          <span className="font-semibold text-success-600 text-sm">
            {item.totalSold.toLocaleString()}
          </span>
          <span className="text-xs text-surface-400 ml-1">{item.unit}</span>
          <p className="text-[10px] text-surface-400">Sold from shop</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: ProductSummaryItem) => {
        if (item.warehouseStock <= 0) {
          return <Badge variant="danger">Out of Warehouse</Badge>;
        }
        if (item.warehouseStock <= (item.lowStockThreshold || 10)) {
          return <Badge variant="warning">Low Stock</Badge>;
        }
        return <Badge variant="success">Available</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: ProductSummaryItem) => (
        <div className="flex items-center gap-2 justify-end">
          {isAdmin && (
            <button
              onClick={() => handleOpenReceiveWithProduct(item)}
              title="Add / Receive Stock into warehouse"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              + Add
            </button>
          )}
          <button
            onClick={() => handleOpenTransferWithProduct(item)}
            title="Transfer stock to shop. Warehouse quantity can go negative."
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-100 text-surface-700 hover:bg-surface-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Transfer
          </button>
        </div>
      ),
    },
  ];

  const receiptPages = Math.max(1, Math.ceil(receiptsHistory.length / 10));
  const transferPages = Math.max(1, Math.ceil(transfersHistory.length / 10));

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header with Title, Description and Primary Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-surface-900">Warehouse Stock</h1>
          <p className="text-sm text-surface-400 mt-1">
            Complete warehouse inventory, stock receipts, and shop transfers in one simple place.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isAdmin && (
            <Button
              onClick={() => {
                setReceiveItems([]);
                setReceiveModalOpen(true);
              }}
              variant="primary"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              + Receive Stock
            </Button>
          )}
          <Button
            onClick={() => {
              setTransferItems([]);
              setTransferModalOpen(true);
            }}
            variant="secondary"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            ⇄ Transfer to Shop
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {success && <Alert variant="success" onDismiss={() => setSuccess(null)}>{success}</Alert>}

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Warehouse Available"
          value={data?.metrics?.totalWarehouseStock?.toLocaleString() ?? (loading ? '...' : 0)}
          sublabel="Units currently in warehouse"
          icon={
            <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
        <StatCard
          label="In Shop"
          value={data?.metrics?.totalShopStock?.toLocaleString() ?? (loading ? '...' : 0)}
          sublabel="Units present in shop"
          icon={
            <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
          }
        />
        <StatCard
          label="Total Sold"
          value={data?.metrics?.totalSold?.toLocaleString() ?? (loading ? '...' : 0)}
          sublabel="Units sold to customers"
          icon={
            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Total Stock Received"
          value={data?.metrics?.totalReceived?.toLocaleString() ?? (loading ? '...' : 0)}
          sublabel="Total initial / received stock"
          icon={
            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          }
        />
      </div>

      {/* Main Tabs (Inventory vs Receipts History vs Transfers History) */}
      <div className="flex border-b border-surface-200">
        <button
          onClick={() => openView('inventory')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            viewTab === 'inventory'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-surface-400 hover:text-surface-700'
          }`}
        >
          Stock Overview ({data?.items?.length || 0} Products)
        </button>
        <button
          onClick={() => openView('receipts_history')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            viewTab === 'receipts_history'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-surface-400 hover:text-surface-700'
          }`}
        >
          Recent Receipts History
        </button>
        <button
          onClick={() => openView('transfers_history')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            viewTab === 'transfers_history'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-surface-400 hover:text-surface-700'
          }`}
        >
          Recent Transfers History
        </button>
      </div>

      {/* VIEW 1: Main Inventory Overview */}
      {viewTab === 'inventory' && paneLoading && <LoadingSpinner className="py-16" />}
      {viewTab === 'inventory' && !paneLoading && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex-1 max-w-md">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search products by name or SKU..."
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  filterTab === 'all'
                    ? 'bg-surface-900 text-white'
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                }`}
              >
                All ({data?.items?.length || 0})
              </button>
              <button
                onClick={() => setFilterTab('in_warehouse')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  filterTab === 'in_warehouse'
                    ? 'bg-primary-600 text-white'
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                }`}
              >
                In Warehouse ({data?.items?.filter(i => i.warehouseStock > 0).length || 0})
              </button>
              <button
                onClick={() => setFilterTab('low')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  filterTab === 'low'
                    ? 'bg-warning-500 text-white'
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                }`}
              >
                Low Stock ({data?.items?.filter(i => i.warehouseStock > 0 && i.warehouseStock <= (i.lowStockThreshold || 10)).length || 0})
              </button>
              <button
                onClick={() => setFilterTab('out_of_stock')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  filterTab === 'out_of_stock'
                    ? 'bg-danger-500 text-white'
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                }`}
              >
                Out of Warehouse ({data?.items?.filter(i => i.warehouseStock <= 0).length || 0})
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="glass-card overflow-hidden">
            <DataTable
              columns={columns}
              data={filteredItems}
              keyExtractor={item => item.productId}
              loading={loading}
              emptyMessage={search ? 'No products match your search.' : 'No warehouse stock recorded yet.'}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-surface-400 pt-2">
            <span>
              Showing {filteredItems.length} of {data?.items?.length || 0} products
            </span>
            <span>
              Warehouse Total: {filteredItems.reduce((s, i) => s + i.warehouseStock, 0).toLocaleString()} units
            </span>
          </div>
        </div>
      )}

      {/* VIEW 2: Receipts History */}
      {viewTab === 'receipts_history' && (
        <div className="glass-card overflow-hidden">
          <DataTable
            columns={[
              {
                key: 'date',
                header: 'Receipt Date',
                render: (m: Movement) => (
                  <div>
                    <span className="text-xs text-surface-800 font-medium">
                      {m.occurredAt ? new Date(m.occurredAt).toLocaleDateString() : '-'}
                    </span>
                    <span className="text-[10px] text-surface-400 ml-2">
                      at {m.recordedAt ? new Date(m.recordedAt).toLocaleTimeString() : '-'}
                    </span>
                  </div>
                ),
              },
              {
                key: 'items',
                header: 'Products Received',
                render: (m: Movement) => (
                  <div className="space-y-1">
                    {m.lineItems?.map((li, idx) => (
                      <div key={idx} className="text-xs">
                        <span className="font-medium text-surface-800">{li.productName}</span>
                        <span className="text-primary-500 font-bold ml-1.5">×{li.quantity}</span>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                key: 'warehouse',
                header: 'Warehouse',
                render: (m: Movement) => <span className="text-xs text-surface-700">{m.destLocationName}</span>,
              },
              {
                key: 'actor',
                header: 'Recorded By',
                render: (m: Movement) => <span className="text-xs text-surface-500">{m.actorName}</span>,
              },
              {
                key: 'notes',
                header: 'Notes',
                render: (m: Movement) => <span className="text-xs text-surface-400">{m.notes || '-'}</span>,
              },
            ]}
            data={receiptsHistory.slice((Math.min(receiptPage, receiptPages) - 1) * 10, Math.min(receiptPage, receiptPages) * 10)}
            keyExtractor={m => m.id}
            loading={historyLoading}
            emptyMessage="No stock received history found."
          />
          <Pagination page={Math.min(receiptPage, receiptPages)} totalPages={receiptPages} onPageChange={setReceiptPage} />
        </div>
      )}

      {/* VIEW 3: Transfers History */}
      {viewTab === 'transfers_history' && (
        <div className="glass-card overflow-hidden">
          <DataTable
            columns={[
              {
                key: 'date',
                header: 'Transfer Date',
                render: (m: Movement) => (
                  <span className="text-xs text-surface-800">
                    {m.recordedAt ? new Date(m.recordedAt).toLocaleString() : '-'}
                  </span>
                ),
              },
              {
                key: 'items',
                header: 'Products Transferred',
                render: (m: Movement) => (
                  <div className="space-y-1">
                    {m.lineItems?.map((li, idx) => (
                      <div key={idx} className="text-xs">
                        <span className="font-medium text-surface-800">{li.productName}</span>
                        <span className="text-primary-500 font-bold ml-1.5">×{li.quantity}</span>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                key: 'route',
                header: 'Route',
                render: (m: Movement) => (
                  <span className="text-xs text-surface-600">
                    {m.sourceLocationName} &rarr; {m.destLocationName}
                  </span>
                ),
              },
              {
                key: 'actor',
                header: 'Transferred By',
                render: (m: Movement) => <span className="text-xs text-surface-500">{m.actorName}</span>,
              },
              {
                key: 'notes',
                header: 'Notes',
                render: (m: Movement) => <span className="text-xs text-surface-400">{m.notes || '-'}</span>,
              },
            ]}
            data={transfersHistory.slice((Math.min(transferPage, transferPages) - 1) * 10, Math.min(transferPage, transferPages) * 10)}
            keyExtractor={m => m.id}
            loading={historyLoading}
            emptyMessage="No transfer history found."
          />
          <Pagination page={Math.min(transferPage, transferPages)} totalPages={transferPages} onPageChange={setTransferPage} />
        </div>
      )}

      {/* MODAL 1: Receive Stock / Add Stock into Warehouse */}
      <Modal
        open={receiveModalOpen}
        onClose={() => setReceiveModalOpen(false)}
        title="Receive / Add Stock into Warehouse"
        maxWidth="lg"
      >
        <form onSubmit={handleReceiveSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Destination Warehouse"
              value={receiveWh}
              onChange={e => setReceiveWh(e.target.value)}
              options={(data?.warehouses || []).map(w => ({ value: w.id, label: w.name }))}
              placeholder="Select warehouse"
            />
            <Input
              label="Receipt Date & Time"
              type="datetime-local"
              value={receiveOccurredAt}
              onChange={e => setReceiveOccurredAt(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Reference / PO Number (optional)"
              placeholder="e.g. PO-2026-001"
              value={receiveReference}
              onChange={e => setReceiveReference(e.target.value)}
            />
            <Input
              label="Notes (optional)"
              placeholder="e.g. Batch #4 shipment from supplier"
              value={receiveNotes}
              onChange={e => setReceiveNotes(e.target.value)}
            />
          </div>

          {/* Add Product Search */}
          <div className="border-t border-surface-200 pt-3">
            <label className="block text-xs font-semibold text-surface-700 uppercase tracking-wider mb-2">
              Add Products to Receipt
            </label>
            <SearchInput
              value={receiveProdSearch}
              onChange={setReceiveProdSearch}
              placeholder="Search product to add..."
            />
            {receiveProdSearch && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-surface-200 divide-y divide-surface-100 bg-white shadow-lg">
                {(data?.items || [])
                  .filter(
                    p =>
                      (p.productName.toLowerCase().includes(receiveProdSearch.toLowerCase()) ||
                        p.productSku.toLowerCase().includes(receiveProdSearch.toLowerCase())) &&
                      !receiveItems.find(li => li.productId === p.productId)
                  )
                  .slice(0, 8)
                  .map(p => (
                    <button
                      key={p.productId}
                      type="button"
                      onClick={() => addReceiveItem(p)}
                      className="w-full px-3 py-2 text-left hover:bg-primary-50 flex items-center justify-between text-sm transition-colors"
                    >
                      <span className="font-medium text-surface-800">{p.productName}</span>
                      <span className="text-xs font-mono text-surface-400">{p.productSku}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Line items list */}
          {receiveItems.length > 0 ? (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {receiveItems.map((li, idx) => (
                <div key={li.productId} className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl border border-surface-200/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-surface-900 truncate">{li.productName}</p>
                    <p className="text-xs text-surface-400">Stock intake</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-surface-500 font-medium">Qty:</label>
                    <Input
                      type="number"
                      min={1}
                      value={li.quantity}
                      onChange={e => updateReceiveQty(idx, parseInt(e.target.value) || 1)}
                      className="w-24 text-center"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeReceiveItem(idx)}
                    className="p-1.5 text-surface-400 hover:text-danger-500 rounded-lg hover:bg-danger-50 transition-colors"
                    title="Remove item"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-surface-400 bg-surface-50 rounded-xl border border-dashed border-surface-200">
              No products selected yet. Search above to add items to this receipt.
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-surface-200">
            <Button variant="ghost" type="button" onClick={() => setReceiveModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={receiveSubmitting} disabled={receiveItems.length === 0}>
              Receive Stock into Warehouse
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Transfer to Shop Modal */}
      <Modal
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        title="Transfer Stock: Warehouse to Shop"
        maxWidth="lg"
      >
        <form onSubmit={handleTransferSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Source Warehouse"
              value={transferWh}
              onChange={e => setTransferWh(e.target.value)}
              options={(data?.warehouses || []).map(w => ({ value: w.id, label: w.name }))}
              placeholder="Select warehouse"
            />
            <div>
              <label className="block text-xs font-semibold text-surface-700 uppercase tracking-wider mb-1.5">
                Destination
              </label>
              <div className="h-10 px-3 bg-surface-100 text-surface-700 text-sm font-medium rounded-xl flex items-center border border-surface-200">
                This Shop (Inventory will be added)
              </div>
            </div>
          </div>

          <Input
            label="Transfer Notes (optional)"
            placeholder="e.g. Weekly shop replenishment"
            value={transferNotes}
            onChange={e => setTransferNotes(e.target.value)}
          />

          {/* Add Product Search for Transfer */}
          <div className="border-t border-surface-200 pt-3">
            <label className="block text-xs font-semibold text-surface-700 uppercase tracking-wider mb-2">
              Add Products to Transfer
            </label>
            <SearchInput
              value={transferProdSearch}
              onChange={setTransferProdSearch}
              placeholder="Search product with warehouse stock..."
            />
            {transferProdSearch && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-surface-200 divide-y divide-surface-100 bg-white shadow-lg">
                {(data?.items || [])
                  .filter(
                    p =>
                      (p.productName.toLowerCase().includes(transferProdSearch.toLowerCase()) ||
                        p.productSku.toLowerCase().includes(transferProdSearch.toLowerCase())) &&
                      !transferItems.find(li => li.productId === p.productId)
                  )
                  .slice(0, 8)
                  .map(p => (
                    <button
                      key={p.productId}
                      type="button"
                      onClick={() => addTransferItem(p)}
                      className="w-full px-3 py-2 text-left hover:bg-primary-50 flex items-center justify-between text-sm transition-colors"
                    >
                      <div>
                        <span className="font-medium text-surface-800">{p.productName}</span>
                        <span className="text-xs font-mono text-surface-400 ml-2">{p.productSku}</span>
                      </div>
                      <span className="text-xs font-semibold text-primary-600">
                        {p.warehouseStock} available
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Line items list for Transfer */}
          {transferItems.length > 0 ? (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {transferItems.map((li, idx) => (
                <div key={li.productId} className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl border border-surface-200/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-surface-900 truncate">{li.productName}</p>
                    <p className="text-xs text-surface-500">
                      Warehouse Available: <span className="font-semibold">{li.maxQuantity ?? 0}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-surface-500 font-medium">Qty:</label>
                    <Input
                      type="number"
                      min={1}
                      value={li.quantity}
                      onChange={e => updateTransferQty(idx, parseInt(e.target.value) || 1)}
                      className="w-24 text-center"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTransferItem(idx)}
                    className="p-1.5 text-surface-400 hover:text-danger-500 rounded-lg hover:bg-danger-50 transition-colors"
                    title="Remove item"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-surface-400 bg-surface-50 rounded-xl border border-dashed border-surface-200">
              No products selected yet. Search above to add items to transfer into shop.
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-surface-200">
            <Button variant="ghost" type="button" onClick={() => setTransferModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={transferSubmitting} disabled={transferItems.length === 0}>
              Execute Transfer to Shop
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
