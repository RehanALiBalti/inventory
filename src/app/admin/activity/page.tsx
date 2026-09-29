'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import { DataTable, Badge, Alert } from '@/components/ui';

interface AuditLog {
  id: string;
  action: string;
  actorName: string;
  targetType: string;
  targetName: string;
  timestamp: string;
}

export default function AdminActivityPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const res = await apiFetch<AuditLog[]>('/api/audit');
    if (res.success && res.data) {
      setLogs(res.data);
    } else {
      setError(res.error || 'Failed to load activity logs');
    }
    setLoading(false);
  };

  const columns = [
    { key: 'timestamp', header: 'Time', render: (l: AuditLog) => (
      <span className="text-surface-700">
        {l.timestamp ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(l.timestamp)) : 'Unknown'}
      </span>
    )},
    { key: 'actorName', header: 'Actor', render: (l: AuditLog) => (
      <span className="font-medium text-surface-800">{l.actorName || 'System'}</span>
    )},
    { key: 'action', header: 'Action', render: (l: AuditLog) => (
      <Badge variant="neutral">{l.action}</Badge>
    )},
    { key: 'targetType', header: 'Target Type', render: (l: AuditLog) => (
      <span className="capitalize">{l.targetType}</span>
    )},
    { key: 'targetName', header: 'Target Name', render: (l: AuditLog) => (
      <span className="text-surface-700">{l.targetName}</span>
    )},
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Global Activity Logs" description="View system-wide audit logs and actions" />
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      
      <div className="glass-card overflow-hidden mt-6">
        <DataTable columns={columns} data={logs} keyExtractor={l => l.id} loading={loading} />
      </div>
    </div>
  );
}
