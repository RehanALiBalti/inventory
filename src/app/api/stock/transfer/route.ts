import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuth, hasShopPermission } from '@/lib/auth/verify';
import { FieldValue } from 'firebase-admin/firestore';
import { validateLineItems, validateRequired, ValidationException, validationErrorResponse } from '@/lib/validation';

// POST /api/stock/transfer - Transfer stock from warehouse to shop
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();

    // Validate inputs
    try {
      validateRequired(body.sourceWarehouseId, 'sourceWarehouseId');
      validateRequired(body.destShopId, 'destShopId');
      validateRequired(body.requestKey, 'requestKey');
    } catch (e) {
      return validationErrorResponse(e as ValidationException);
    }

    const { sourceWarehouseId, destShopId, requestKey, notes } = body;
    let lineItems;

    try {
      lineItems = validateLineItems(body.lineItems);
    } catch (e) {
      return validationErrorResponse(e as ValidationException);
    }

    // Permission check: must have transfer permission for the destination shop
    if (!hasShopPermission(user, destShopId, 'transfer')) {
      return NextResponse.json(
        { success: false, error: 'You do not have transfer permission for this shop' },
        { status: 403 }
      );
    }

    // Idempotency check
    const existingMovement = await adminDb.collection('stockMovements')
      .where('requestKey', '==', requestKey)
      .limit(1)
      .get();

    if (!existingMovement.empty) {
      const existing = existingMovement.docs[0].data();
      if (existing.type !== 'warehouse_to_shop_transfer' ||
          existing.sourceLocationId !== sourceWarehouseId ||
          existing.destLocationId !== destShopId) {
        return NextResponse.json(
          { success: false, error: 'Request key already used for a different transaction' },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, data: { movementId: existingMovement.docs[0].id, idempotent: true } });
    }

    // Verify warehouse exists and is active
    const whDoc = await adminDb.collection('warehouses').doc(sourceWarehouseId).get();
    if (!whDoc.exists || !whDoc.data()?.active) {
      return NextResponse.json({ success: false, error: 'Warehouse not found or inactive' }, { status: 404 });
    }
    const warehouseName = whDoc.data()!.name;

    // Verify shop exists and is active
    const shopDoc = await adminDb.collection('shops').doc(destShopId).get();
    if (!shopDoc.exists || !shopDoc.data()?.active) {
      return NextResponse.json({ success: false, error: 'Shop not found or inactive' }, { status: 404 });
    }
    const shopData = shopDoc.data()!;
    const shopName = shopData.name;

    // Verify warehouse is linked to the shop
    if (whDoc.data()?.shopId !== destShopId) {
      return NextResponse.json(
        { success: false, error: 'This warehouse is not linked to the destination shop' },
        { status: 400 }
      );
    }

    // Verify all products exist and are active
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

    // Execute transfer in a transaction
    const movementId = await adminDb.runTransaction(async (txn) => {
      // Step 1: Execute ALL reads first
      const sourceBalanceRefs = lineItems.map(item => {
        const sourceBalanceId = `${sourceWarehouseId}_${item.productId}`;
        return adminDb.collection('stockBalances').doc(sourceBalanceId);
      });
      const destBalanceRefs = lineItems.map(item => {
        const destBalanceId = `${destShopId}_${item.productId}`;
        return adminDb.collection('stockBalances').doc(destBalanceId);
      });

      const [sourceBalanceDocs, destBalanceDocs] = await Promise.all([
        Promise.all(sourceBalanceRefs.map(ref => txn.get(ref))),
        Promise.all(destBalanceRefs.map(ref => txn.get(ref)))
      ]);

      // Step 2: Validate all stock availability before writing
      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const productData = productDocs[i].data()!;
        const sourceBalanceDoc = sourceBalanceDocs[i];
        const sourceQty = sourceBalanceDoc.exists ? sourceBalanceDoc.data()!.quantity : 0;

        if (sourceQty < item.quantity) {
          throw new Error(
            `Insufficient stock for ${productData.name}: available ${sourceQty}, requested ${item.quantity}`
          );
        }
      }

      // Step 3: Perform all writes
      const movementRef = adminDb.collection('stockMovements').doc();
      const movementLineItems = [];

      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const productData = productDocs[i].data()!;
        const sourceBalanceRef = sourceBalanceRefs[i];
        const sourceBalanceDoc = sourceBalanceDocs[i];
        const destBalanceRef = destBalanceRefs[i];
        const destBalanceDoc = destBalanceDocs[i];

        const sourceQty = sourceBalanceDoc.exists ? sourceBalanceDoc.data()!.quantity : 0;
        const destQty = destBalanceDoc.exists ? destBalanceDoc.data()!.quantity : 0;

        const newSourceQty = sourceQty - item.quantity;
        const newDestQty = destQty + item.quantity;

        // Update source balance
        if (sourceBalanceDoc.exists) {
          txn.update(sourceBalanceRef, {
            quantity: newSourceQty,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          txn.set(sourceBalanceRef, {
            productId: item.productId,
            productName: productData.name,
            locationId: sourceWarehouseId,
            locationName: warehouseName,
            locationType: 'warehouse',
            shopId: destShopId,
            quantity: newSourceQty,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // Update destination balance
        if (destBalanceDoc.exists) {
          txn.update(destBalanceRef, {
            quantity: newDestQty,
            productName: productData.name,
            locationName: shopName,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          txn.set(destBalanceRef, {
            productId: item.productId,
            productName: productData.name,
            locationId: destShopId,
            locationName: shopName,
            locationType: 'shop',
            shopId: destShopId,
            quantity: newDestQty,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        movementLineItems.push({
          productId: item.productId,
          productName: productData.name,
          productSku: productData.sku,
          quantity: item.quantity,
          sourceBalanceBefore: sourceQty,
          sourceBalanceAfter: newSourceQty,
          destBalanceBefore: destQty,
          destBalanceAfter: newDestQty,
        });
      }

      // Create movement record
      txn.set(movementRef, {
        requestKey,
        type: 'warehouse_to_shop_transfer',
        lineItems: movementLineItems,
        sourceLocationId: sourceWarehouseId,
        sourceLocationName: warehouseName,
        sourceLocationType: 'warehouse',
        destLocationId: destShopId,
        destLocationName: shopName,
        destLocationType: 'shop',
        shopId: destShopId,
        actorUid: user.uid,
        actorName: user.fullName,
        recordedAt: FieldValue.serverTimestamp(),
        occurredAt: FieldValue.serverTimestamp(),
        notes: notes?.trim() || null,
        reversed: false,
      });

      // Create audit log
      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: 'transfer',
        actorUid: user.uid,
        actorName: user.fullName,
        targetType: 'transfer',
        targetId: movementRef.id,
        shopId: destShopId,
        shopName: shopName,
        movementId: movementRef.id,
        notes: `Transfer from ${warehouseName} to ${shopName}`,
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
    console.error('Transfer error:', e);
    return NextResponse.json({ success: false, error: 'Failed to process transfer' }, { status: 500 });
  }
}
