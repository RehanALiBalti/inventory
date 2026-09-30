import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/verify';
import { FieldValue } from 'firebase-admin/firestore';
import { validateLineItems, validateDate, validateRequired, ValidationException, validationErrorResponse } from '@/lib/validation';

// POST /api/stock/receive - Record stock received into a warehouse (admin only)
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();

    // Validate inputs
    try {
      validateRequired(body.shopId, 'shopId');
      validateRequired(body.warehouseId, 'warehouseId');
      validateRequired(body.requestKey, 'requestKey');
    } catch (e) {
      return validationErrorResponse(e as ValidationException);
    }

    const { shopId, warehouseId, requestKey, reference, notes } = body;
    let lineItems;
    let occurredAt: Date;

    try {
      lineItems = validateLineItems(body.lineItems);
      occurredAt = validateDate(body.occurredAt, 'occurredAt');
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
      // If same request key but different content, reject
      if (existing.type !== 'stock_received' || existing.destLocationId !== warehouseId) {
        return NextResponse.json(
          { success: false, error: 'Request key already used for a different transaction' },
          { status: 409 }
        );
      }
      // Return the original result
      return NextResponse.json({ success: true, data: { movementId: existingMovement.docs[0].id, idempotent: true } });
    }

    // Verify warehouse exists and is active and belongs to the shop
    const whDoc = await adminDb.collection('warehouses').doc(warehouseId).get();
    if (!whDoc.exists || !whDoc.data()?.active || whDoc.data()?.shopId !== shopId) {
      return NextResponse.json({ success: false, error: 'Warehouse not found, inactive, or belongs to another shop' }, { status: 404 });
    }
    const warehouseName = whDoc.data()!.name;

    // Verify all products exist and are active
    const productDocs = await Promise.all(
      lineItems.map(item => adminDb.collection('products').doc(item.productId).get())
    );
    for (let i = 0; i < productDocs.length; i++) {
      if (!productDocs[i].exists || !productDocs[i].data()?.active || productDocs[i].data()?.shopId !== shopId) {
        return NextResponse.json(
          { success: false, error: `Product ${lineItems[i].productId} not found, inactive, or belongs to another shop` },
          { status: 404 }
        );
      }
    }

    // Execute stock receive in a transaction
    const movementId = await adminDb.runTransaction(async (txn) => {
      // Step 1: Execute ALL reads first
      const balanceRefs = lineItems.map(item => {
        const balanceId = `${warehouseId}_${item.productId}`;
        return adminDb.collection('stockBalances').doc(balanceId);
      });
      const balanceDocs = await Promise.all(balanceRefs.map(ref => txn.get(ref)));

      // Step 2: Perform all writes
      const movementRef = adminDb.collection('stockMovements').doc();
      const movementLineItems = [];

      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const productData = productDocs[i].data()!;
        const balanceRef = balanceRefs[i];
        const balanceDoc = balanceDocs[i];

        const currentQty = balanceDoc.exists ? balanceDoc.data()!.quantity : 0;
        const newQty = currentQty + item.quantity;

        // Update or create balance
        if (balanceDoc.exists) {
          txn.update(balanceRef, {
            quantity: newQty,
            productName: productData.name,
            locationName: warehouseName,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          txn.set(balanceRef, {
            productId: item.productId,
            productName: productData.name,
            locationId: warehouseId,
            locationName: warehouseName,
            locationType: 'warehouse',
            shopId,
            quantity: newQty,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        movementLineItems.push({
          productId: item.productId,
          productName: productData.name,
          productSku: productData.sku,
          quantity: item.quantity,
          destBalanceBefore: currentQty,
          destBalanceAfter: newQty,
        });
      }

      // Create movement record
      txn.set(movementRef, {
        requestKey,
        type: 'stock_received',
        lineItems: movementLineItems,
        destLocationId: warehouseId,
        destLocationName: warehouseName,
        destLocationType: 'warehouse',
        shopId,
        actorUid: admin.uid,
        actorName: admin.fullName,
        recordedAt: FieldValue.serverTimestamp(),
        occurredAt: occurredAt,
        notes: notes?.trim() || null,
        reference: reference?.trim() || null,
        reversed: false,
      });

      // Create audit log
      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: 'stock_received',
        actorUid: admin.uid,
        actorName: admin.fullName,
        targetType: 'warehouse',
        targetId: warehouseId,
        targetName: warehouseName,
        movementId: movementRef.id,
        notes: notes?.trim() || null,
        timestamp: FieldValue.serverTimestamp(),
      });

      return movementRef.id;
    });

    return NextResponse.json({ success: true, data: { movementId } }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Stock receive error:', e);
    return NextResponse.json({ success: false, error: 'Failed to record stock received' }, { status: 500 });
  }
}
