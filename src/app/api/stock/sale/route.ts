import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuth, hasShopPermission } from '@/lib/auth/verify';
import { FieldValue } from 'firebase-admin/firestore';
import { validateLineItems, validateDate, validateRequired, ValidationException, validationErrorResponse } from '@/lib/validation';

// POST /api/stock/sale - Record a sale (deduct from shop stock)
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();

    // Validate inputs
    try {
      validateRequired(body.shopId, 'shopId');
      validateRequired(body.requestKey, 'requestKey');
    } catch (e) {
      return validationErrorResponse(e as ValidationException);
    }

    const { shopId, requestKey, notes } = body;
    let lineItems;
    let occurredAt: Date;

    try {
      lineItems = validateLineItems(body.lineItems);
      occurredAt = validateDate(body.occurredAt, 'occurredAt');
    } catch (e) {
      return validationErrorResponse(e as ValidationException);
    }

    // Permission check
    if (!hasShopPermission(user, shopId, 'recordSale')) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to record sales for this shop' },
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
      if (existing.type !== 'sale' || existing.sourceLocationId !== shopId) {
        return NextResponse.json(
          { success: false, error: 'Request key already used for a different transaction' },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, data: { movementId: existingMovement.docs[0].id, idempotent: true } });
    }

    // Verify shop exists and is active
    const shopDoc = await adminDb.collection('shops').doc(shopId).get();
    if (!shopDoc.exists || !shopDoc.data()?.active) {
      return NextResponse.json({ success: false, error: 'Shop not found or inactive' }, { status: 404 });
    }
    const shopName = shopDoc.data()!.name;

    // Verify all products
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

    // Execute sale in a transaction
    const movementId = await adminDb.runTransaction(async (txn) => {
      // Step 1: Execute ALL reads first
      const balanceRefs = lineItems.map(item => {
        const balanceId = `${shopId}_${item.productId}`;
        return adminDb.collection('stockBalances').doc(balanceId);
      });
      const balanceDocs = await Promise.all(balanceRefs.map(ref => txn.get(ref)));

      // Step 2: Validate all stock availability before writing
      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const productData = productDocs[i].data()!;
        const balanceDoc = balanceDocs[i];
        const currentQty = balanceDoc.exists ? balanceDoc.data()!.quantity : 0;

        if (currentQty < item.quantity) {
          throw new Error(
            `Insufficient stock for ${productData.name}: available ${currentQty}, requested ${item.quantity}`
          );
        }
      }

      // Step 3: Perform all writes
      const movementRef = adminDb.collection('stockMovements').doc();
      const movementLineItems = [];

      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const productData = productDocs[i].data()!;
        const balanceRef = balanceRefs[i];
        const balanceDoc = balanceDocs[i];
        const currentQty = balanceDoc.exists ? balanceDoc.data()!.quantity : 0;
        const newQty = currentQty - item.quantity;

        // Update balance
        if (balanceDoc.exists) {
          txn.update(balanceRef, {
            quantity: newQty,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        movementLineItems.push({
          productId: item.productId,
          productName: productData.name,
          productSku: productData.sku,
          quantity: item.quantity,
          sourceBalanceBefore: currentQty,
          sourceBalanceAfter: newQty,
        });
      }

      // Create sale movement
      txn.set(movementRef, {
        requestKey,
        type: 'sale',
        lineItems: movementLineItems,
        sourceLocationId: shopId,
        sourceLocationName: shopName,
        sourceLocationType: 'shop',
        shopId,
        actorUid: user.uid,
        actorName: user.fullName,
        recordedAt: FieldValue.serverTimestamp(),
        occurredAt: occurredAt,
        notes: notes?.trim() || null,
        reversed: false,
      });

      // Create audit log
      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: 'sale',
        actorUid: user.uid,
        actorName: user.fullName,
        targetType: 'sale',
        targetId: movementRef.id,
        shopId: shopId,
        shopName: shopName,
        movementId: movementRef.id,
        notes: notes?.trim() || null,
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
    console.error('Sale error:', e);
    return NextResponse.json({ success: false, error: 'Failed to record sale' }, { status: 500 });
  }
}
