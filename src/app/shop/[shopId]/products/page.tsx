'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import { DataTable, Badge, Button, Modal, Input, Alert, SearchInput } from '@/components/ui';

interface ProductData {
  id: string; name: string; sku: string; active: boolean;
  unit: string; lowStockThreshold: number | null; fractionalUnits: boolean;
}

export default function AdminProductsPage() {
  const params = useParams();
  const shopId = params.shopId as string;
  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<ProductData | null>(null);
  const [formData, setFormData] = useState({ name: '', sku: '', unit: 'pcs', lowStockThreshold: '', active: true, fractionalUnits: false });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    setLoading(true);
    const res = await apiFetch<ProductData[]>(`/api/products?active=false&shopId=${shopId}`); // load all for this shop
    if (res.success && res.data) setProducts(res.data);
    else setError(res.error || 'Failed to load products');
    setLoading(false);
  };

  const openModal = (p?: ProductData) => {
    if (p) {
      setEditingProd(p);
      setFormData({
        name: p.name, sku: p.sku, unit: p.unit || 'pcs', active: p.active,
        lowStockThreshold: p.lowStockThreshold?.toString() || '', fractionalUnits: p.fractionalUnits || false
      });
    } else {
      setEditingProd(null);
      setFormData({ name: '', sku: '', unit: 'pcs', lowStockThreshold: '10', active: true, fractionalUnits: false });
    }
    setFormError('');
    setModalOpen(true);
  };

  const saveProduct = async () => {
    setSaving(true);
    setFormError('');
    
    const body = {
      ...formData,
      shopId,
      id: editingProd?.id,
      lowStockThreshold: formData.lowStockThreshold ? parseInt(formData.lowStockThreshold) : null
    };

    const method = editingProd ? 'PATCH' : 'POST';
    const res = await apiFetch('/api/products', { method, body: JSON.stringify(body) });

    if (res.success) {
      setModalOpen(false);
      loadProducts();
    } else {
      setFormError(res.error || 'Failed to save product');
    }
    setSaving(false);
  };

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    { key: 'sku', header: 'SKU', render: (p: ProductData) => <span className="text-sm font-mono text-surface-400">{p.sku}</span> },
    { key: 'name', header: 'Name', render: (p: ProductData) => <span className="font-medium text-surface-900">{p.name}</span> },
    { key: 'unit', header: 'Unit', render: (p: ProductData) => <span className="text-sm text-surface-400">{p.unit}</span> },
    { key: 'threshold', header: 'Low Stock', render: (p: ProductData) => <span className="text-sm text-surface-400">{p.lowStockThreshold ?? '-'}</span> },
    { key: 'status', header: 'Status', render: (p: ProductData) => (
      <Badge variant={p.active ? 'success' : 'neutral'}>{p.active ? 'Active' : 'Inactive'}</Badge>
    )},
    { key: 'actions', header: '', render: (p: ProductData) => (
      <div className="flex justify-end"><Button size="sm" variant="secondary" onClick={() => openModal(p)}>Edit</Button></div>
    )}
  ];

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-start mb-6">
        <PageHeader title="Products" description="Manage product catalog" />
        <div className="flex items-center gap-3">
          <Link href={`/shop/${shopId}/import`}>
            <Button variant="secondary">
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import Excel
            </Button>
          </Link>
          <Button onClick={() => openModal()}>+ Add Product</Button>
        </div>
      </div>

      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-4">{error}</Alert>}

      <div className="mb-4 max-w-md">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or SKU..." />
      </div>

      <div className="glass-card overflow-hidden">
        <DataTable columns={columns} data={filtered} keyExtractor={p => p.id} loading={loading} />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingProd ? 'Edit Product' : 'New Product'}>
        <div className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          <Input label="Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          <Input label="SKU" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} disabled={!!editingProd} hint={!!editingProd ? "SKU cannot be changed after creation" : ""} />
          <div className="flex gap-4">
            <Input label="Unit (e.g. pcs, kg, box)" value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} className="flex-1" />
            <Input label="Low Stock Threshold" type="number" min="0" value={formData.lowStockThreshold} onChange={e => setFormData({...formData, lowStockThreshold: e.target.value})} className="flex-1" />
          </div>
          <div className="flex gap-6 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="form-checkbox rounded bg-white border-surface-600 text-primary-500"
                checked={formData.active} onChange={e => setFormData({...formData, active: e.target.checked})} />
              <span className="text-sm text-surface-700">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer hidden">
              <input type="checkbox" className="form-checkbox rounded bg-white border-surface-600 text-primary-500"
                checked={formData.fractionalUnits} onChange={e => setFormData({...formData, fractionalUnits: e.target.checked})} />
              <span className="text-sm text-surface-700">Allow fractional quantities</span>
            </label>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={saveProduct} loading={saving}>Save Product</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
