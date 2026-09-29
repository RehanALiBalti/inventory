'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import { DataTable, Badge, Button, Modal, Input, Alert } from '@/components/ui';

interface WarehouseData { id: string; name: string; active: boolean; }

export default function AdminWarehousesPage() {
  const params = useParams();
  const shopId = params.shopId as string;
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [whModalOpen, setWhModalOpen] = useState(false);
  const [editingWh, setEditingWh] = useState<WarehouseData | null>(null);
  const [whFormData, setWhFormData] = useState({ name: '', active: true });
  
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const wRes = await apiFetch<WarehouseData[]>(`/api/warehouses?shopId=${shopId}`);
    if (wRes.success && wRes.data) setWarehouses(wRes.data);
    else setError(wRes.error || 'Failed to load warehouses');
    setLoading(false);
  };

  const openWhModal = (w?: WarehouseData) => {
    setEditingWh(w || null);
    setWhFormData({ name: w?.name || '', active: w ? w.active : true });
    setFormError('');
    setWhModalOpen(true);
  };

  const saveWarehouse = async () => {
    setSaving(true);
    setFormError('');
    const body = { ...whFormData, shopId, id: editingWh?.id };
    const res = await apiFetch('/api/warehouses', { method: editingWh ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    if (res.success) { setWhModalOpen(false); loadData(); }
    else setFormError(res.error || 'Failed to save');
    setSaving(false);
  };

  const whColumns = [
    { key: 'name', header: 'Name', render: (w: WarehouseData) => <span className="font-medium text-surface-900">{w.name}</span> },
    { key: 'status', header: 'Status', render: (w: WarehouseData) => <Badge variant={w.active ? 'success' : 'neutral'}>{w.active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', header: '', render: (w: WarehouseData) => <div className="flex justify-end"><Button size="sm" variant="secondary" onClick={() => openWhModal(w)}>Edit</Button></div> }
  ];

  return (
    <div className="animate-fade-in space-y-10">
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

      <div>
        <div className="flex justify-between items-start mb-6">
          <PageHeader title="Warehouses" description="Manage physical inventory locations for this shop" />
          <Button onClick={() => openWhModal()}>Add Warehouse</Button>
        </div>
        <div className="glass-card overflow-hidden">
          <DataTable columns={whColumns} data={warehouses} keyExtractor={w => w.id} loading={loading} />
        </div>
      </div>

      <Modal open={whModalOpen} onClose={() => setWhModalOpen(false)} title={editingWh ? 'Edit Warehouse' : 'New Warehouse'}>
        <div className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          <Input label="Warehouse Name" value={whFormData.name} onChange={e => setWhFormData({...whFormData, name: e.target.value})} />
          {editingWh && (
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input type="checkbox" className="form-checkbox rounded bg-white border-surface-600 text-primary-500"
                checked={whFormData.active} onChange={e => setWhFormData({...whFormData, active: e.target.checked})} />
              <span className="text-sm text-surface-700">Active</span>
            </label>
          )}
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setWhModalOpen(false)}>Cancel</Button>
            <Button onClick={saveWarehouse} loading={saving}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
