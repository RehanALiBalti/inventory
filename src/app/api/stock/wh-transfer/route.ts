import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/verify';
import { FieldValue } from 'firebase-admin/firestore';
import { validateLineItems, validateRequired, ValidationException, validationErrorResponse } from '@/lib/validation';

// POST /api/stock/wh-transfer - Warehouse to warehouse transfer (admin only)
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();

    try {
      validateRequired(body.sourceWarehouseId, 'sourceWarehouseId');
      validateRequired(body.destWarehouseId, 'destWarehouseId');
      validateRequired(body.requestKey, 'requestKey');
    } catch (e) {
      return validationErrorResponse(e as ValidationException);
    }

    const { sourceWarehouseId, destWarehouseId, requestKey, notes } = body;

    if (sourceWarehouseId === destWarehouseId) {
      return NextResponse.json({ success: false, error: 'Source and destination must be different' }, { status: 400 });
    }

    let lineItems;
    try {
      lineItems = validateLineItems(body.lineItems);
    } catch (e) {
      return validationErrorResponse(e as ValidationException);
    }

    // Idempotency check
    const existingMovement = await adminDb.collection('stockMovements')
      .where('requestKey', '==', requestKey)
      .limit(1)
      .get();

    if (!existingMovement.empty) {
      const existing = existingMovement.docs[0].data();
      if (existing.type !== 'warehouse_to_warehouse_transfer') {
        return NextResponse.json(
          { success: false, error: 'Request key already used for a different transaction' },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, data: { movementId: existingMovement.docs[0].id, idempotent: true } });
    }

    // Verify warehouses
    const sourceDoc = await adminDb.collection('warehouses').doc(sourceWarehouseId).get();
    const destDoc = await adminDb.collection('warehouses').doc(destWarehouseId).get();

    if (!sourceDoc.exists || !sourceDoc.data()?.active) {
      return NextResponse.json({ success: false, error: 'Source warehouse not found or inactive' }, { status: 404 });
    }
    if (!destDoc.exists || !destDoc.data()?.active) {
      return NextResponse.json({ success: false, error: 'Destination warehouse not found or inactive' }, { status: 404 });
    }

    const sourceName = sourceDoc.data()!.name;
    const destName = destDoc.data()!.name;

    // Verify products
    const productDocs = await Promise.all(
      lineItems.map(item => adminDb.collection('products').doc(item.productId).get())
    );
    for (let i = 0; i < productDocs.length; i++) {
      if (!productDocs[i].exists || !productDocs[i].data()?.active) {
        return NextResponse.json(
          { success: false, error: `Product ${lineItems[i].productId} not found or inactive` },
          { status: 404 }
        );
      }
    }

    const movementId = await adminDb.runTransaction(async (txn) => {
      const movementRef = adminDb.collection('stockMovements').doc();
      const movementLineItems = [];

      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const productData = productDocs[i].data()!;

        const sourceBalanceId = `${sourceWarehouseId}_${item.productId}`;
        const sourceBalanceRef = adminDb.collection('stockBalances').doc(sourceBalanceId);
        const sourceBalanceDoc = await txn.get(sourceBalanceRef);
        const sourceQty = sourceBalanceDoc.exists ? sourceBalanceDoc.data()!.quantity : 0;

        if (sourceQty < item.quantity) {
          throw new Error(
            `Insufficient stock for ${productData.name}: available ${sourceQty}, requested ${item.quantity}`
          );
        }

        const destBalanceId = `${destWarehouseId}_${item.productId}`;
        const destBalanceRef = adminDb.collection('stockBalances').doc(destBalanceId);
        const destBalanceDoc = await txn.get(destBalanceRef);
        const destQty = destBalanceDoc.exists ? destBalanceDoc.data()!.quantity : 0;

        const newSourceQty = sourceQty - item.quantity;
        const newDestQty = destQty + item.quantity;

        if (sourceBalanceDoc.exists) {
          txn.update(sourceBalanceRef, { quantity: newSourceQty, updatedAt: FieldValue.serverTimestamp() });
        }

        if (destBalanceDoc.exists) {
          txn.update(destBalanceRef, { quantity: newDestQty, productName: productData.name, locationName: destName, updatedAt: FieldValue.serverTimestamp() });
        } else {
          txn.set(destBalanceRef, {
            productId: item.productId, productName: productData.name,
            locationId: destWarehouseId, locationName: destName, locationType: 'warehouse',
            quantity: newDestQty, updatedAt: FieldValue.serverTimestamp(),
          });
        }

        movementLineItems.push({
          productId: item.productId, productName: productData.name, productSku: productData.sku,
          quantity: item.quantity,
          sourceBalanceBefore: sourceQty, sourceBalanceAfter: newSourceQty,
          destBalanceBefore: destQty, destBalanceAfter: newDestQty,
        });
      }

      txn.set(movementRef, {
        requestKey, type: 'warehouse_to_warehouse_transfer', lineItems: movementLineItems,
        sourceLocationId: sourceWarehouseId, sourceLocationName: sourceName, sourceLocationType: 'warehouse',
        destLocationId: destWarehouseId, destLocationName: destName, destLocationType: 'warehouse',
        actorUid: admin.uid, actorName: admin.fullName,
        recordedAt: FieldValue.serverTimestamp(), occurredAt: FieldValue.serverTimestamp(),
        notes: notes?.trim() || null, reversed: false,
      });

      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: 'transfer', actorUid: admin.uid, actorName: admin.fullName,
        targetType: 'wh-transfer', targetId: movementRef.id,
        movementId: movementRef.id,
        notes: `WH Transfer: ${sourceName} → ${destName}`,
        timestamp: FieldValue.serverTimestamp(),
      });

      return movementRef.id;
    });

    return NextResponse.json({ success: true, data: { movementId } }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof Error && e.message.startsWith('Insufficient stock')) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
    console.error('WH transfer error:', e);
    return NextResponse.json({ success: false, error: 'Failed to process WH transfer' }, { status: 500 });
  }
}
