import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuth, hasShopPermission } from '@/lib/auth/verify';
import { FieldValue } from 'firebase-admin/firestore';
import { validateRequired, ValidationException, validationErrorResponse } from '@/lib/validation';

// POST /api/stock/reverse - Reverse a committed movement (admin or authorized shop staff)
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();

    try {
      validateRequired(body.movementId, 'movementId');
      validateRequired(body.reason, 'reason');
      validateRequired(body.requestKey, 'requestKey');
    } catch (e) {
      return validationErrorResponse(e as ValidationException);
    }

    const { movementId, reason, requestKey } = body;

    // Idempotency check
    const existingReversal = await adminDb.collection('stockMovements')
      .where('requestKey', '==', requestKey)
      .limit(1)
      .get();

    if (!existingReversal.empty) {
      const existing = existingReversal.docs[0].data();
      if (existing.type !== 'reversal' || existing.originalMovementId !== movementId) {
        return NextResponse.json(
          { success: false, error: 'Request key already used for a different transaction' },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, data: { reversalId: existingReversal.docs[0].id, idempotent: true } });
    }

    // Fetch original movement
    const originalDoc = await adminDb.collection('stockMovements').doc(movementId).get();
    if (!originalDoc.exists) {
      return NextResponse.json({ success: false, error: 'Original movement not found' }, { status: 404 });
    }

    const original = originalDoc.data()!;

    // Permission check: Admin can reverse any movement; Staff can reverse within permitted shop or own movements
    const isAdmin = user.role === 'admin';
    const shopId = original.shopId || original.sourceLocationId || original.destLocationId;
    const isActor = original.actorUid === user.uid;
    const hasShopPerm = shopId ? (
      original.type === 'sale'
        ? hasShopPermission(user, shopId, 'recordSale')
        : hasShopPermission(user, shopId, 'transfer')
    ) : false;

    if (!isAdmin && !hasShopPerm && !isActor) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to reverse this transaction. Contact an administrator.' },
        { status: 403 }
      );
    }

    if ((original.type === 'adjustment' || original.type === 'shop_to_warehouse_transfer') && !isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Only an admin can reverse this transaction' },
        { status: 403 }
      );
    }

    // Check if already reversed
    if (original.reversed) {
      return NextResponse.json({ success: false, error: 'This movement has already been reversed' }, { status: 400 });
    }

    // Cannot reverse a reversal
    if (original.type === 'reversal') {
      return NextResponse.json({ success: false, error: 'Cannot reverse a reversal' }, { status: 400 });
    }

    // Execute reversal in a transaction. All balance reads happen before any writes.
    const reversalId = await adminDb.runTransaction(async (txn) => {
      const reversalRef = adminDb.collection('stockMovements').doc();
      const items = original.lineItems || [];

      type Touch = {
        ref: FirebaseFirestore.DocumentReference;
        itemIndex: number;
        side: 'source' | 'dest' | 'adjust';
        delta: number;
        locationId: string;
        locationName: string;
        locationType: string;
        productId: string;
        productName: string;
      };

      const touches: Touch[] = [];

      if (original.type === 'adjustment') {
        const locationId = original.sourceLocationId as string;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const direction = item.direction === 'decrease' ? 'decrease' : 'increase';
          touches.push({
            ref: adminDb.collection('stockBalances').doc(`${locationId}_${item.productId}`),
            itemIndex: i,
            side: 'adjust',
            delta: direction === 'increase' ? -Number(item.quantity) : Number(item.quantity),
            locationId,
            locationName: original.sourceLocationName,
            locationType: original.sourceLocationType,
            productId: item.productId,
            productName: item.productName,
          });
        }
      } else {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (original.sourceLocationId) {
            touches.push({
              ref: adminDb.collection('stockBalances').doc(`${original.sourceLocationId}_${item.productId}`),
              itemIndex: i,
              side: 'source',
              delta: Number(item.quantity),
              locationId: original.sourceLocationId,
              locationName: original.sourceLocationName,
              locationType: original.sourceLocationType,
              productId: item.productId,
              productName: item.productName,
            });
          }
          if (original.destLocationId) {
            touches.push({
              ref: adminDb.collection('stockBalances').doc(`${original.destLocationId}_${item.productId}`),
              itemIndex: i,
              side: 'dest',
              delta: -Number(item.quantity),
              locationId: original.destLocationId,
              locationName: original.destLocationName,
              locationType: original.destLocationType,
              productId: item.productId,
              productName: item.productName,
            });
          }
        }
      }

      const snaps = await Promise.all(touches.map((touch) => txn.get(touch.ref)));

      const reversalByIndex: Record<number, {
        productId: string;
        productName: string;
        productSku: string;
        quantity: number;
        direction?: 'increase' | 'decrease';
        sourceBalanceBefore?: number;
        sourceBalanceAfter?: number;
        destBalanceBefore?: number;
        destBalanceAfter?: number;
      }> = {};

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        reversalByIndex[i] = {
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity,
          direction: item.direction === 'increase'
            ? 'decrease'
            : item.direction === 'decrease'
              ? 'increase'
              : undefined,
        };
      }

      for (let i = 0; i < touches.length; i++) {
        const touch = touches[i];
        const snap = snaps[i];
        const current = snap.exists ? Number(snap.data()!.quantity) || 0 : 0;
        const next = current + touch.delta;

        if (touch.side === 'dest' && next < 0) {
          throw new Error(
            `Cannot reverse: ${touch.productName} at ${touch.locationName} has ${current} units, ` +
            `but reversal requires ${Math.abs(touch.delta)}. Some stock may have already been sold or transferred.`
          );
        }

        if (snap.exists) {
          txn.update(touch.ref, { quantity: next, updatedAt: FieldValue.serverTimestamp() });
        } else if (touch.side === 'dest') {
          throw new Error(`Cannot reverse: ${touch.productName} has no balance at ${touch.locationName}.`);
        } else {
          txn.set(touch.ref, {
            productId: touch.productId,
            productName: touch.productName,
            locationId: touch.locationId,
            locationName: touch.locationName,
            locationType: touch.locationType,
            shopId: original.shopId || null,
            quantity: next,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        const line = reversalByIndex[touch.itemIndex];
        if (touch.side === 'dest') {
          line.destBalanceBefore = current;
          line.destBalanceAfter = next;
        } else {
          line.sourceBalanceBefore = current;
          line.sourceBalanceAfter = next;
        }
      }

      const reversalLineItems = items.map((_: unknown, index: number) => reversalByIndex[index]);

      // Mark original as reversed
      const originalRef = adminDb.collection('stockMovements').doc(movementId);
      txn.update(originalRef, {
        reversed: true,
        reversalMovementId: reversalRef.id,
      });

      // Create reversal movement
      txn.set(reversalRef, {
        requestKey,
        type: 'reversal',
        lineItems: reversalLineItems,
        sourceLocationId: original.destLocationId || null,
        sourceLocationName: original.destLocationName || null,
        sourceLocationType: original.destLocationType || null,
        destLocationId: original.sourceLocationId || null,
        destLocationName: original.sourceLocationName || null,
        destLocationType: original.sourceLocationType || null,
        shopId: original.shopId || null,
        shopScope: original.shopScope || null,
        actorUid: user.uid,
        actorName: user.fullName,
        recordedAt: FieldValue.serverTimestamp(),
        occurredAt: FieldValue.serverTimestamp(),
        notes: reason.trim(),
        originalMovementId: movementId,
        reversed: false,
      });

      // Create audit log
      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: 'reversal',
        actorUid: user.uid,
        actorName: user.fullName,
        targetType: 'movement',
        targetId: movementId,
        movementId: reversalRef.id,
        notes: `Reversal of ${original.type}: ${reason.trim()}`,
        before: { reversed: false },
        after: { reversed: true, reversalMovementId: reversalRef.id },
        timestamp: FieldValue.serverTimestamp(),
      });

      return reversalRef.id;
    });

    return NextResponse.json({ success: true, data: { reversalId } }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof Error && e.message.startsWith('Cannot reverse:')) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
    console.error('Reversal error:', e);
    return NextResponse.json({ success: false, error: 'Failed to process reversal' }, { status: 500 });
  }
}
