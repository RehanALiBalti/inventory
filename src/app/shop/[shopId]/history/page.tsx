'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import { DataTable, Badge, Select, Alert, Button, Pagination } from '@/components/ui';
import { downloadSaleReceiptPdf, downloadTransferPdf, downloadMasterHistoryReportPdf } from '@/lib/pdf/generatePdf';
import { fetchAllMovements } from '@/lib/fetchAllMovements';
import { ReverseModal } from '@/components/stock/ReverseModal';

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
  const [shopName, setShopName] = useState('Shop Store');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [exportingAll, setExportingAll] = useState(false);

  // Reversal Modal
  const [reverseModalOpen, setReverseModalOpen] = useState(false);
  const [selectedReverseMovement, setSelectedReverseMovement] = useState<Movement | null>(null);

  useEffect(() => {
    loadShop();
  }, [shopId]);

  useEffect(() => {
    loadMovements();
  }, [shopId, typeFilter]);

  const loadShop = async () => {
    const res = await apiFetch<{ id: string; name: string }[]>('/api/shops');
    if (res.success && res.data) {
      const found = res.data.find(s => s.id === shopId);
      if (found) setShopName(found.name);
    }
  };

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

  const handleDownloadAll = async () => {
    setExportingAll(true);
    setError(null);
    let url = `/api/stock/movements?shopId=${shopId}`;
    if (typeFilter) url += `&type=${typeFilter}`;
    if (!isAdmin) url += '&ownOnly=true';

    const { items, error: loadError } = await fetchAllMovements<Movement>(url);
    setExportingAll(false);
    if (loadError) {
      setError(loadError);
      return;
    }
    if (items.length === 0) {
      setError('No history records to download.');
      return;
    }
    const filterLabel = typeFilter ? (typeLabels[typeFilter] || typeFilter) : 'All Movements';
    await downloadMasterHistoryReportPdf(shopName, items, filterLabel);
  };

  const handleDownloadPdf = (m: Movement) => {
    if (m.type === 'sale') {
      downloadSaleReceiptPdf({
        id: m.id,
        shopName: m.sourceLocationName || shopName,
        actorName: m.actorName,
        recordedAt: m.recordedAt,
        occurredAt: m.occurredAt,
        lineItems: m.lineItems,
        notes: m.notes,
        reversed: m.reversed,
      });
    } else if (m.type.includes('transfer')) {
      downloadTransferPdf({
        id: m.id,
        sourceLocationName: m.sourceLocationName || 'Warehouse',
        destLocationName: m.destLocationName || shopName,
        actorName: m.actorName,
        recordedAt: m.recordedAt,
        occurredAt: m.occurredAt,
        lineItems: m.lineItems,
        notes: m.notes,
        reversed: m.reversed,
      });
    }
  };

  const handleOpenReverse = (m: Movement) => {
    setSelectedReverseMovement(m);
    setReverseModalOpen(true);
  };

  const handleReversalSuccess = () => {
    setSuccess('Transaction reversed successfully! Inventory has been updated.');
    loadMovements();
  };

  const columns = [
    { key: 'recordedAt', header: 'Date', render: (m: Movement) => (
      <span className="text-xs text-surface-400">{m.recordedAt ? new Date(m.recordedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '-'}</span>
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
            <span className="text-primary-500 font-semibold ml-1">×{li.quantity}</span>
          </div>
        ))}
        {(m.lineItems?.length || 0) > 3 && <span className="text-xs text-surface-400">+{m.lineItems.length - 3} more</span>}
      </div>
    )},
    { key: 'actor', header: 'By', render: (m: Movement) => <span className="text-xs text-surface-700">{m.actorName}</span> },
    { key: 'status', header: 'Status', render: (m: Movement) => (
      m.reversed ? <Badge variant="danger">Reversed</Badge> : <Badge variant="success">Active</Badge>
    )},
    { key: 'actions', header: 'Actions', render: (m: Movement) => {
      const isPdfEligible = m.type === 'sale' || m.type.includes('transfer');
      const canReverse = !m.reversed && m.type !== 'reversal';
      return (
        <div className="flex items-center gap-1.5 justify-end">
          {isPdfEligible && (
            <button
              onClick={() => handleDownloadPdf(m)}
              title="Download PDF"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-100 hover:bg-surface-200 text-surface-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              PDF
            </button>
          )}
          {canReverse && (
            <button
              onClick={() => handleOpenReverse(m)}
              title="Reverse this transaction"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-danger-600 hover:bg-danger-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Reverse
            </button>
          )}
        </div>
      );
    }},
  ];

  const historyPages = Math.max(1, Math.ceil(movements.length / 10));

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title="Transaction History" description={isAdmin ? 'All shop transactions and documents' : 'Your transaction history and documents'} />
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {success && <Alert variant="success" onDismiss={() => setSuccess(null)}>{success}</Alert>}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="max-w-xs w-full">
          <Select value={typeFilter} onChange={(e) => { setPage(1); setLoading(true); setTypeFilter(e.target.value); }} placeholder="All types"
            options={Object.entries(typeLabels).map(([val, label]) => ({ value: val, label }))} />
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={exportingAll}
          onClick={handleDownloadAll}
          title="Download every history record as one PDF"
        >
          Download all PDF
        </Button>
      </div>
      <div className="glass-card overflow-hidden">
        <DataTable
          columns={columns}
          data={movements.slice((Math.min(page, historyPages) - 1) * 10, Math.min(page, historyPages) * 10)}
          keyExtractor={(m) => m.id}
          loading={loading}
          emptyMessage="No transactions found"
        />
        <Pagination page={Math.min(page, historyPages)} totalPages={historyPages} onPageChange={setPage} />
      </div>

      <ReverseModal
        open={reverseModalOpen}
        onClose={() => setReverseModalOpen(false)}
        movement={selectedReverseMovement}
        onSuccess={handleReversalSuccess}
      />
    </div>
  );
}
