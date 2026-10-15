import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/verify';
import { FieldValue } from 'firebase-admin/firestore';
import { validateLineItems, validateRequired, ValidationException, validationErrorResponse } from '@/lib/validation';

// POST /api/stock/return - Move stock from a shop back to its warehouse (admin only)
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();

    try {
      validateRequired(body.sourceShopId, 'sourceShopId');
      validateRequired(body.destWarehouseId, 'destWarehouseId');
      validateRequired(body.requestKey, 'requestKey');
    } catch (e) {
      return validationErrorResponse(e as ValidationException);
    }

    const { sourceShopId, destWarehouseId, requestKey, notes } = body;
    let lineItems;

    try {
      lineItems = validateLineItems(body.lineItems);
    } catch (e) {
      return validationErrorResponse(e as ValidationException);
    }

    const existingMovement = await adminDb.collection('stockMovements')
      .where('requestKey', '==', requestKey)
      .limit(1)
      .get();

    if (!existingMovement.empty) {
      const existing = existingMovement.docs[0].data();
      if (existing.type !== 'shop_to_warehouse_transfer' ||
          existing.sourceLocationId !== sourceShopId ||
          existing.destLocationId !== destWarehouseId) {
        return NextResponse.json(
          { success: false, error: 'Request key already used for a different transaction' },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, data: { movementId: existingMovement.docs[0].id, idempotent: true } });
    }

    const shopDoc = await adminDb.collection('shops').doc(sourceShopId).get();
    if (!shopDoc.exists || !shopDoc.data()?.active) {
      return NextResponse.json({ success: false, error: 'Shop not found or inactive' }, { status: 404 });
    }
    const shopName = shopDoc.data()!.name as string;

    const whDoc = await adminDb.collection('warehouses').doc(destWarehouseId).get();
    if (!whDoc.exists || !whDoc.data()?.active || whDoc.data()?.shopId !== sourceShopId) {
      return NextResponse.json(
        { success: false, error: 'Warehouse not found, inactive, or belongs to another shop' },
        { status: 404 }
      );
    }
    const warehouseName = whDoc.data()!.name as string;

    const productDocs = await Promise.all(
      lineItems.map(item => adminDb.collection('products').doc(item.productId).get())
    );
    for (let i = 0; i < productDocs.length; i++) {
      const data = productDocs[i].data();
      if (!productDocs[i].exists || !data?.active || data.shopId !== sourceShopId) {
        return NextResponse.json(
          { success: false, error: `Product ${lineItems[i].productId} not found, inactive, or belongs to another shop` },
          { status: 404 }
        );
      }
    }

    const movementId = await adminDb.runTransaction(async (txn) => {
      const sourceBalanceRefs = lineItems.map(item =>
        adminDb.collection('stockBalances').doc(`${sourceShopId}_${item.productId}`)
      );
      const destBalanceRefs = lineItems.map(item =>
        adminDb.collection('stockBalances').doc(`${destWarehouseId}_${item.productId}`)
      );

      const [sourceBalanceDocs, destBalanceDocs] = await Promise.all([
        Promise.all(sourceBalanceRefs.map(ref => txn.get(ref))),
        Promise.all(destBalanceRefs.map(ref => txn.get(ref))),
      ]);

      const movementRef = adminDb.collection('stockMovements').doc();
      const movementLineItems = [];

      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const productData = productDocs[i].data()!;
        const sourceQty = sourceBalanceDocs[i].exists ? Number(sourceBalanceDocs[i].data()!.quantity) || 0 : 0;
        const destQty = destBalanceDocs[i].exists ? Number(destBalanceDocs[i].data()!.quantity) || 0 : 0;
        const newSourceQty = sourceQty - item.quantity;
        const newDestQty = destQty + item.quantity;

        if (newSourceQty < 0) {
          throw new Error(
            `Insufficient stock for ${productData.name}: shop has ${sourceQty}, return needs ${item.quantity}`
          );
        }

        const sourceRef = sourceBalanceRefs[i];
        if (sourceBalanceDocs[i].exists) {
          txn.update(sourceRef, {
            quantity: newSourceQty,
            productName: productData.name,
            locationName: shopName,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          txn.set(sourceRef, {
            productId: item.productId,
            productName: productData.name,
            locationId: sourceShopId,
            locationName: shopName,
            locationType: 'shop',
            shopId: sourceShopId,
            quantity: newSourceQty,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        const destRef = destBalanceRefs[i];
        if (destBalanceDocs[i].exists) {
          txn.update(destRef, {
            quantity: newDestQty,
            productName: productData.name,
            locationName: warehouseName,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          txn.set(destRef, {
            productId: item.productId,
            productName: productData.name,
            locationId: destWarehouseId,
            locationName: warehouseName,
            locationType: 'warehouse',
            shopId: sourceShopId,
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

      txn.set(movementRef, {
        requestKey,
        type: 'shop_to_warehouse_transfer',
        lineItems: movementLineItems,
        sourceLocationId: sourceShopId,
        sourceLocationName: shopName,
        sourceLocationType: 'shop',
        destLocationId: destWarehouseId,
        destLocationName: warehouseName,
        destLocationType: 'warehouse',
        shopId: sourceShopId,
        actorUid: admin.uid,
        actorName: admin.fullName,
        recordedAt: FieldValue.serverTimestamp(),
        occurredAt: FieldValue.serverTimestamp(),
        notes: notes?.trim() || null,
        reversed: false,
      });

      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: 'transfer',
        actorUid: admin.uid,
        actorName: admin.fullName,
        targetType: 'transfer',
        targetId: movementRef.id,
        shopId: sourceShopId,
        shopName,
        movementId: movementRef.id,
        notes: `Return from ${shopName} to ${warehouseName}`,
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
    console.error('Stock return error:', e);
    return NextResponse.json({ success: false, error: 'Failed to return stock to warehouse' }, { status: 500 });
  }
}
