'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/AppLayout';
import { Button, Alert, Card, DataTable, Badge } from '@/components/ui';

interface ImportRow {
  rowIndex: number;
  rawName: string;
  trimmedName: string;
  status: 'new' | 'duplicate' | 'committed' | 'error';
  generatedSku?: string;
  error?: string;
}

interface PreviewResult {
  importJobId: string;
  fileName: string;
  totalRows: number;
  newProducts: number;
  duplicates: number;
  rows: ImportRow[];
}

export default function AdminImportPage() {
  const params = useParams();
  const shopId = params.shopId as string;
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{ committed: number; errors: number; total: number } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setPreview(null);
      setCommitResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('shopId', shopId);
    
    try {
      const res = await fetch('/api/import/preview', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      if (data.success) {
        setPreview(data.data);
      } else {
        setError(data.error || 'Failed to process file');
      }
    } catch (err) {
      setError('Network error processing file');
    }
    setLoading(false);
  };

  const handleCommit = async () => {
    if (!preview) return;
    setCommitting(true);
    setError(null);
    
    interface CommitResult {
      alreadyCommitted?: boolean;
      committed: number;
      errors: number;
      total: number;
    }

    const res = await apiFetch<CommitResult>('/api/import/commit', {
      method: 'POST',
      body: JSON.stringify({ importJobId: preview.importJobId, shopId })
    });
    
    if (res.success && res.data) {
      if (res.data.alreadyCommitted) {
        setError('This import job has already been committed.');
      } else {
        setCommitResult({
          committed: res.data.committed,
          errors: res.data.errors,
          total: res.data.total
        });
        setPreview(null);
      }
    } else {
      setError(res.error || 'Failed to commit import');
    }
    setCommitting(false);
  };

  const columns = [
    { key: 'row', header: 'Row', render: (r: ImportRow) => <span className="text-surface-400">{r.rowIndex}</span> },
    { key: 'name', header: 'Product Name', render: (r: ImportRow) => <span className="font-medium text-surface-800">{r.trimmedName}</span> },
    { key: 'sku', header: 'SKU (Generated)', render: (r: ImportRow) => <span className="font-mono text-xs text-primary-300">{r.generatedSku || '-'}</span> },
    { key: 'status', header: 'Status', render: (r: ImportRow) => (
      <div className="flex flex-col gap-1">
        <Badge variant={r.status === 'new' ? 'success' : 'warning'}>
          {r.status === 'new' ? 'Will Import' : 'Skip (Duplicate)'}
        </Badge>
        {r.error && <span className="text-xs text-danger-400">{r.error}</span>}
      </div>
    )}
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Import Products" description="Bulk import products from Excel (.xlsx) files" />
      
      {error && <Alert variant="error" onDismiss={() => setError(null)} className="mb-6">{error}</Alert>}
      {commitResult && (
        <Alert variant="success" onDismiss={() => setCommitResult(null)} className="mb-6">
          Import completed! Successfully imported {commitResult.committed} products. 
          {commitResult.errors > 0 && ` Encountered errors on ${commitResult.errors} products.`}
        </Alert>
      )}

      {!preview && !commitResult && (
        <Card className="max-w-xl">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-800 mb-2">Excel File</label>
              <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="block w-full text-sm text-surface-400
                file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
                file:text-sm file:font-semibold file:bg-white file:text-primary-400
                hover:file:bg-surface-100 cursor-pointer"
              />
              <p className="mt-2 text-xs text-surface-400">
                The file must contain a column named "ARTICLES" or similar (or the second column will be used) containing product names.
              </p>
            </div>
            
            <div className="pt-4 flex justify-end">
              <Button onClick={handleUpload} disabled={!file || loading} loading={loading}>
                Preview Import
              </Button>
            </div>
          </div>
        </Card>
      )}

      {preview && (
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-lg font-bold text-surface-900">Import Summary</h3>
                <p className="text-sm text-surface-400">File: {preview.fileName}</p>
              </div>
              <div className="flex gap-4">
                <div className="bg-white px-4 py-2 rounded-lg text-center">
                  <div className="text-2xl font-bold text-success-400">{preview.newProducts}</div>
                  <div className="text-xs text-surface-400 uppercase tracking-wider">New</div>
                </div>
                <div className="bg-white px-4 py-2 rounded-lg text-center">
                  <div className="text-2xl font-bold text-warning-400">{preview.duplicates}</div>
                  <div className="text-xs text-surface-400 uppercase tracking-wider">Duplicates</div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setPreview(null)} disabled={committing}>Cancel</Button>
              <Button onClick={handleCommit} loading={committing} disabled={preview.newProducts === 0}>
                Commit {preview.newProducts} Products
              </Button>
            </div>
          </Card>
          
          <div className="glass-card overflow-hidden">
            <DataTable 
              columns={columns} 
              data={preview.rows} 
              keyExtractor={(r) => r.rowIndex.toString()} 
              emptyMessage="No data found"
            />
          </div>
        </div>
      )}
    </div>
  );
}
