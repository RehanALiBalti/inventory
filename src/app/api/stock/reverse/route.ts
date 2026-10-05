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

    // Check if already reversed
    if (original.reversed) {
      return NextResponse.json({ success: false, error: 'This movement has already been reversed' }, { status: 400 });
    }

    // Cannot reverse a reversal
    if (original.type === 'reversal') {
      return NextResponse.json({ success: false, error: 'Cannot reverse a reversal' }, { status: 400 });
    }

    // Execute reversal in a transaction
    const reversalId = await adminDb.runTransaction(async (txn) => {
      const reversalRef = adminDb.collection('stockMovements').doc();
      const reversalLineItems = [];

      for (const item of original.lineItems) {
        // Reverse the stock effects
        if (original.sourceLocationId) {
          // Add back to source
          const sourceBalanceId = `${original.sourceLocationId}_${item.productId}`;
          const sourceBalanceRef = adminDb.collection('stockBalances').doc(sourceBalanceId);
          const sourceBalanceDoc = await txn.get(sourceBalanceRef);
          const sourceQty = sourceBalanceDoc.exists ? sourceBalanceDoc.data()!.quantity : 0;
          const newSourceQty = sourceQty + item.quantity;

          if (sourceBalanceDoc.exists) {
            txn.update(sourceBalanceRef, { quantity: newSourceQty, updatedAt: FieldValue.serverTimestamp() });
          } else {
            txn.set(sourceBalanceRef, {
              productId: item.productId, productName: item.productName,
              locationId: original.sourceLocationId, locationName: original.sourceLocationName,
              locationType: original.sourceLocationType,
              quantity: newSourceQty, updatedAt: FieldValue.serverTimestamp(),
            });
          }

          item.sourceBalanceBefore = sourceQty;
          item.sourceBalanceAfter = newSourceQty;
        }

        if (original.destLocationId) {
          // Deduct from destination
          const destBalanceId = `${original.destLocationId}_${item.productId}`;
          const destBalanceRef = adminDb.collection('stockBalances').doc(destBalanceId);
          const destBalanceDoc = await txn.get(destBalanceRef);
          const destQty = destBalanceDoc.exists ? destBalanceDoc.data()!.quantity : 0;
          const newDestQty = destQty - item.quantity;

          // Cannot go negative
          if (newDestQty < 0) {
            throw new Error(
              `Cannot reverse: ${item.productName} at ${original.destLocationName} has ${destQty} units, ` +
              `but reversal requires ${item.quantity}. Some stock may have already been sold or transferred.`
            );
          }

          txn.update(destBalanceRef, { quantity: newDestQty, updatedAt: FieldValue.serverTimestamp() });

          item.destBalanceBefore = destQty;
          item.destBalanceAfter = newDestQty;
        }

        reversalLineItems.push({
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity,
          sourceBalanceBefore: item.sourceBalanceBefore,
          sourceBalanceAfter: item.sourceBalanceAfter,
          destBalanceBefore: item.destBalanceBefore,
          destBalanceAfter: item.destBalanceAfter,
        });
      }

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
