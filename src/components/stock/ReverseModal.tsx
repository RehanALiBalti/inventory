'use client';

import React, { useState } from 'react';
import { Modal, Button, Input, Alert, LoadingSpinner } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { v4 as uuidv4 } from 'uuid';

export interface MovementForReversal {
  id: string;
  type?: string;
  actorName?: string;
  occurredAt?: string;
  recordedAt?: string;
  sourceLocationName?: string;
  destLocationName?: string;
  lineItems: { productName: string; quantity: number }[];
  notes?: string;
}

interface ReverseModalProps {
  open: boolean;
  onClose: () => void;
  movement: MovementForReversal | null;
  onSuccess: (reversalId?: string) => void;
}

export function ReverseModal({ open, onClose, movement, onSuccess }: ReverseModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!movement) return null;

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a specific reason for reversing this transaction.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await apiFetch<{ reversalId: string }>('/api/stock/reverse', {
      method: 'POST',
      body: JSON.stringify({
        movementId: movement.id,
        reason: reason.trim(),
        requestKey: uuidv4(),
      }),
    });

    if (res.success) {
      setReason('');
      onSuccess(res.data?.reversalId);
      onClose();
    } else {
      setError(res.error || 'Failed to reverse transaction');
    }
    setLoading(false);
  };

  const isSale = movement.type === 'sale';
  const isTransfer = movement.type?.includes('transfer');

  return (
    <Modal open={open} onClose={onClose} title="Reverse Transaction" maxWidth="md">
      <form onSubmit={handleReverse} className="space-y-4">
        {error && (
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Transaction Summary Card */}
        <div className="bg-surface-50 p-4 rounded-xl border border-surface-200/80 space-y-2">
          <div className="flex items-center justify-between text-xs text-surface-500">
            <span>
              Ref ID: <strong className="font-mono text-surface-800">{movement.id.slice(-8).toUpperCase()}</strong>
            </span>
            <span>
              {movement.occurredAt
                ? new Date(movement.occurredAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                : movement.recordedAt
                ? new Date(movement.recordedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                : '-'}
            </span>
          </div>

          <div className="border-t border-surface-200/60 pt-2">
            <p className="text-xs font-semibold text-surface-700 uppercase tracking-wider mb-1.5">
              Items Affected:
            </p>
            <div className="space-y-1">
              {movement.lineItems?.map((li, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <span className="font-medium text-surface-900">{li.productName}</span>
                  <span className="font-bold text-danger-600">×{li.quantity}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-surface-200/60 pt-2 text-[11px] text-surface-600">
            {isSale && (
              <span className="text-emerald-700 font-medium">
                Stock Effect: Items will be added back into the shop inventory.
              </span>
            )}
            {isTransfer && (
              <span className="text-amber-700 font-medium">
                Stock Effect: Items will be deducted from {movement.destLocationName || 'Shop'} and returned to {movement.sourceLocationName || 'Warehouse'}.
              </span>
            )}
          </div>
        </div>

        {/* Reason Input */}
        <div>
          <Input
            label="Reason for Reversal *"
            placeholder="e.g. Customer returned items, Cashier entered wrong quantity, Duplicate entry..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            autoFocus
          />
          <p className="text-[11px] text-surface-400 mt-1">
            An audit log and reversal ledger movement will be permanently created with your user account.
          </p>
        </div>

        {/* Confirmation Buttons */}
        <div className="pt-3 border-t border-surface-200 flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={loading || !reason.trim()}>
            {loading ? (
              <div className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                <span>Reversing...</span>
              </div>
            ) : (
              'Confirm Reversal'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
