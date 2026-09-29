'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import { DataTable, Badge, Button, Modal, Select, Alert, LoadingSpinner, Input } from '@/components/ui';

interface UserData {
  uid: string; email: string; fullName: string; role: string; status: string;
  shopPermissions?: Record<string, { view: boolean; transfer: boolean; recordSale: boolean }>;
}

interface ShopData { id: string; name: string; }

export default function AdminStaffPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [shops, setShops] = useState<ShopData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [perms, setPerms] = useState<Record<string, { view: boolean; transfer: boolean; recordSale: boolean }>>({});
  const [saving, setSaving] = useState(false);
  
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', fullName: '', password: '', role: 'staff' });
  const [adding, setAdding] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ uid: '', fullName: '', role: 'staff' });
  const [editing, setEditing] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [uRes, sRes] = await Promise.all([
      apiFetch<UserData[]>('/api/staff'),
      apiFetch<ShopData[]>('/api/shops'),
    ]);
    if (uRes.success && uRes.data) setUsers(uRes.data);
    else setError(uRes.error || 'Failed to load users');
    if (sRes.success && sRes.data) setShops(sRes.data);
    setLoading(false);
  };

  const handleUpdateStatus = async (uid: string, action: string) => {
    const res = await apiFetch('/api/staff', { method: 'PATCH', body: JSON.stringify({ uid, action }) });
    if (res.success) loadData();
    else alert(res.error || 'Failed to update status');
  };

  const handleDeleteUser = async (uid: string) => {
    if (!confirm('Are you sure you want to delete this staff member? This cannot be undone.')) return;
    const res = await apiFetch(`/api/staff?uid=${uid}`, { method: 'DELETE' });
    if (res.success) loadData();
    else alert(res.error || 'Failed to delete user');
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    const res = await apiFetch('/api/staff', {
      method: 'POST',
      body: JSON.stringify(addForm),
    });
    if (res.success) {
      setAddModalOpen(false);
      setAddForm({ email: '', fullName: '', password: '', role: 'staff' });
      loadData();
    } else {
      alert(res.error || 'Failed to add staff');
    }
    setAdding(false);
  };

  const openEditModal = (u: UserData) => {
    setEditForm({ uid: u.uid, fullName: u.fullName, role: u.role });
    setEditModalOpen(true);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditing(true);
    const res = await apiFetch('/api/staff', {
      method: 'PUT',
      body: JSON.stringify(editForm),
    });
    if (res.success) {
      setEditModalOpen(false);
      loadData();
    } else {
      alert(res.error || 'Failed to update staff');
    }
    setEditing(false);
  };

  const openPermModal = (u: UserData) => {
    setEditingUser(u);
    setPerms(u.shopPermissions || {});
    setPermModalOpen(true);
  };

  const handlePermChange = (shopId: string, field: 'view'|'transfer'|'recordSale', val: boolean) => {
    const current = perms[shopId] || { view: false, transfer: false, recordSale: false };
    const updated = { ...current, [field]: val };
    
    // Auto-enable view if transfer or recordSale is checked
    if ((field === 'transfer' || field === 'recordSale') && val) {
      updated.view = true;
    }
    // Auto-disable transfer and recordSale if view is unchecked
    if (field === 'view' && !val) {
      updated.transfer = false;
      updated.recordSale = false;
    }
    
    setPerms({ ...perms, [shopId]: updated });
  };

  const savePerms = async () => {
    if (!editingUser) return;
    setSaving(true);
    const res = await apiFetch('/api/staff/permissions', {
      method: 'PUT',
      body: JSON.stringify({ uid: editingUser.uid, shopPermissions: perms })
    });
    if (res.success) {
      setPermModalOpen(false);
      loadData();
    } else {
      alert(res.error || 'Failed to save permissions');
    }
    setSaving(false);
  };

  const columns = [
    { key: 'fullName', header: 'Name', render: (u: UserData) => <span className="font-medium text-surface-900">{u.fullName}</span> },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', render: (u: UserData) => (
      <Badge variant={u.role === 'admin' ? 'info' : 'neutral'}>{u.role}</Badge>
    )},
    { key: 'status', header: 'Status', render: (u: UserData) => (
      <Badge variant={u.status === 'approved' ? 'success' : u.status === 'pending' ? 'warning' : 'danger'}>
        {u.status}
      </Badge>
    )},
    { key: 'actions', header: '', render: (u: UserData) => (
      <div className="flex gap-2 justify-end">
        {u.status === 'pending' && (
          <Button size="sm" onClick={() => handleUpdateStatus(u.uid, 'approve')}>Approve</Button>
        )}
        {u.status === 'approved' && u.role !== 'admin' && (
          <>
            <Button size="sm" variant="secondary" onClick={() => openPermModal(u)}>Permissions</Button>
            <Button size="sm" variant="danger" onClick={() => handleUpdateStatus(u.uid, 'reject')}>Revoke</Button>
          </>
        )}
        {u.status === 'rejected' && (
          <Button size="sm" onClick={() => handleUpdateStatus(u.uid, 'approve')}>Restore</Button>
        )}
        {u.role !== 'admin' && (
          <Button size="sm" variant="secondary" onClick={() => openEditModal(u)}>Edit</Button>
        )}
        {u.role !== 'admin' && (
          <Button size="sm" variant="danger" onClick={() => handleDeleteUser(u.uid)}>Delete</Button>
        )}
      </div>
    )}
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader 
        title="Staff Management" 
        description="Approve accounts, add staff manually, and manage shop access permissions"
        actions={<Button onClick={() => setAddModalOpen(true)}>Add Staff</Button>}
      />
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      <div className="glass-card overflow-hidden">
        <DataTable columns={columns} data={users} keyExtractor={u => u.uid} loading={loading} />
      </div>

      <Modal open={permModalOpen} onClose={() => setPermModalOpen(false)} title={`Shop Permissions for ${editingUser?.fullName}`}>
        <div className="space-y-4">
          <p className="text-sm text-surface-400">Configure which shops this staff member can access and what actions they can perform.</p>
          <div className="border border-surface-200 rounded-lg overflow-hidden divide-y divide-surface-200">
            {shops.map(shop => {
              const p = perms[shop.id] || { view: false, transfer: false, recordSale: false };
              return (
                <div key={shop.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="font-medium text-surface-800">{shop.name}</div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="form-checkbox rounded bg-white border-surface-600 text-primary-500"
                        checked={p.view} onChange={e => handlePermChange(shop.id, 'view', e.target.checked)} />
                      <span className="text-sm text-surface-700">View</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="form-checkbox rounded bg-white border-surface-600 text-primary-500"
                        checked={p.transfer} onChange={e => handlePermChange(shop.id, 'transfer', e.target.checked)} />
                      <span className="text-sm text-surface-700">Transfer</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="form-checkbox rounded bg-white border-surface-600 text-primary-500"
                        checked={p.recordSale} onChange={e => handlePermChange(shop.id, 'recordSale', e.target.checked)} />
                      <span className="text-sm text-surface-700">Sell</span>
                    </label>
                  </div>
                </div>
              );
            })}
            {shops.length === 0 && <div className="p-4 text-center text-surface-400 text-sm">No shops created yet.</div>}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setPermModalOpen(false)}>Cancel</Button>
            <Button onClick={savePerms} loading={saving}>Save Permissions</Button>
          </div>
        </div>
      </Modal>

      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add Staff">
        <form onSubmit={handleAddUser} className="space-y-4">
          <div>
            <Input 
              label="Full Name" 
              required 
              type="text"
              value={addForm.fullName} 
              onChange={e => setAddForm({ ...addForm, fullName: e.target.value })} 
            />
          </div>
          <div>
            <Input 
              label="Email" 
              required 
              type="email"
              value={addForm.email} 
              onChange={e => setAddForm({ ...addForm, email: e.target.value })} 
            />
          </div>
          <div>
            <Input 
              label="Password" 
              required 
              type="text" 
              minLength={6}
              value={addForm.password} 
              onChange={e => setAddForm({ ...addForm, password: e.target.value })} 
            />
          </div>
          <div>
            <Select 
              label="Role"
              value={addForm.role}
              onChange={e => setAddForm({ ...addForm, role: e.target.value })}
              options={[
                { value: 'staff', label: 'Staff' },
                { value: 'admin', label: 'Admin' }
              ]}
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="ghost" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={adding}>Add Staff</Button>
          </div>
        </form>
      </Modal>

      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Staff">
        <form onSubmit={handleEditUser} className="space-y-4">
          <div>
            <Input 
              label="Full Name" 
              required 
              type="text"
              value={editForm.fullName} 
              onChange={e => setEditForm({ ...editForm, fullName: e.target.value })} 
            />
          </div>
          <div>
            <Select 
              label="Role"
              value={editForm.role}
              onChange={e => setEditForm({ ...editForm, role: e.target.value })}
              options={[
                { value: 'staff', label: 'Staff' },
                { value: 'admin', label: 'Admin' }
              ]}
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="ghost" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={editing}>Save Changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
