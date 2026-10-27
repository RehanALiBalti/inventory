import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/verify';
import { FieldValue } from 'firebase-admin/firestore';
import {
  validateArray,
  validateRequired,
  validateString,
  ValidationException,
  validationErrorResponse,
  type ValidationError,
} from '@/lib/validation';

type AdjustDirection = 'increase' | 'decrease';

interface AdjustLine {
  productId: string;
  quantity: number;
  direction: AdjustDirection;
}

function validateAdjustLineItems(items: unknown): AdjustLine[] {
  const arr = validateArray<Record<string, unknown>>(items, 'lineItems');
  if (arr.length > 50) {
    throw new ValidationException([{
      field: 'lineItems',
      message: 'Maximum 50 line items per adjustment',
    }]);
  }

  const errors: ValidationError[] = [];
  const seen = new Set<string>();
  const validated: AdjustLine[] = [];

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const prefix = `lineItems[${i}]`;

    if (!item.productId || typeof item.productId !== 'string') {
      errors.push({ field: `${prefix}.productId`, message: 'Product ID is required' });
      continue;
    }
    if (seen.has(item.productId)) {
      errors.push({ field: `${prefix}.productId`, message: 'Duplicate product in line items' });
      continue;
    }
    seen.add(item.productId);

    if (item.direction !== 'increase' && item.direction !== 'decrease') {
      errors.push({ field: `${prefix}.direction`, message: 'Direction must be increase or decrease' });
      continue;
    }

    const qty = Number(item.quantity);
    if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
      errors.push({ field: `${prefix}.quantity`, message: 'Quantity must be a positive whole number' });
      continue;
    }

    validated.push({ productId: item.productId, quantity: qty, direction: item.direction });
  }

  if (errors.length > 0) throw new ValidationException(errors);
  return validated;
}

// POST /api/stock/adjust - Correct shop or warehouse stock (admin only)
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();

    try {
      validateRequired(body.shopId, 'shopId');
      validateRequired(body.locationId, 'locationId');
      validateRequired(body.locationType, 'locationType');
      validateRequired(body.requestKey, 'requestKey');
      validateString(body.notes, 'notes', 500);
    } catch (e) {
      return validationErrorResponse(e as ValidationException);
    }

    const { shopId, locationId, requestKey } = body;
    const locationType = body.locationType as string;
    const notes = String(body.notes).trim();

    if (locationType !== 'shop' && locationType !== 'warehouse') {
      return NextResponse.json(
        { success: false, error: 'locationType must be shop or warehouse' },
        { status: 400 }
      );
    }

    let lineItems: AdjustLine[];
    try {
      lineItems = validateAdjustLineItems(body.lineItems);
    } catch (e) {
      return validationErrorResponse(e as ValidationException);
    }

    const existingMovement = await adminDb.collection('stockMovements')
      .where('requestKey', '==', requestKey)
      .limit(1)
      .get();

    if (!existingMovement.empty) {
      const existing = existingMovement.docs[0].data();
      if (existing.type !== 'adjustment' || existing.sourceLocationId !== locationId) {
        return NextResponse.json(
          { success: false, error: 'Request key already used for a different transaction' },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, data: { movementId: existingMovement.docs[0].id, idempotent: true } });
    }

    const shopDoc = await adminDb.collection('shops').doc(shopId).get();
    if (!shopDoc.exists || !shopDoc.data()?.active) {
      return NextResponse.json({ success: false, error: 'Shop not found or inactive' }, { status: 404 });
    }
    const shopName = shopDoc.data()!.name as string;
    let locationName = shopName;

    if (locationType === 'shop') {
      if (locationId !== shopId) {
        return NextResponse.json(
          { success: false, error: 'Shop adjustments must use the shop as the location' },
          { status: 400 }
        );
      }
    } else {
      const whDoc = await adminDb.collection('warehouses').doc(locationId).get();
      if (!whDoc.exists || !whDoc.data()?.active || whDoc.data()?.shopId !== shopId) {
        return NextResponse.json(
          { success: false, error: 'Warehouse not found, inactive, or belongs to another shop' },
          { status: 404 }
        );
      }
      locationName = whDoc.data()!.name as string;
    }

    const productDocs = await Promise.all(
      lineItems.map(item => adminDb.collection('products').doc(item.productId).get())
    );
    for (let i = 0; i < productDocs.length; i++) {
      const data = productDocs[i].data();
      if (!productDocs[i].exists || !data?.active || data.shopId !== shopId) {
        return NextResponse.json(
          { success: false, error: `Product ${lineItems[i].productId} not found, inactive, or belongs to another shop` },
          { status: 404 }
        );
      }
    }

    const movementId = await adminDb.runTransaction(async (txn) => {
      const balanceRefs = lineItems.map(item =>
        adminDb.collection('stockBalances').doc(`${locationId}_${item.productId}`)
      );
      const balanceDocs = await Promise.all(balanceRefs.map(ref => txn.get(ref)));

      const movementRef = adminDb.collection('stockMovements').doc();
      const movementLineItems = [];

      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const productData = productDocs[i].data()!;
        const balanceRef = balanceRefs[i];
        const balanceDoc = balanceDocs[i];
        const currentQty = balanceDoc.exists ? Number(balanceDoc.data()!.quantity) || 0 : 0;
        const delta = item.direction === 'increase' ? item.quantity : -item.quantity;
        const newQty = currentQty + delta;

        if (balanceDoc.exists) {
          txn.update(balanceRef, {
            quantity: newQty,
            productName: productData.name,
            locationName,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          txn.set(balanceRef, {
            productId: item.productId,
            productName: productData.name,
            locationId,
            locationName,
            locationType,
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
          direction: item.direction,
          sourceBalanceBefore: currentQty,
          sourceBalanceAfter: newQty,
        });
      }

      txn.set(movementRef, {
        requestKey,
        type: 'adjustment',
        lineItems: movementLineItems,
        sourceLocationId: locationId,
        sourceLocationName: locationName,
        sourceLocationType: locationType,
        shopId,
        actorUid: admin.uid,
        actorName: admin.fullName,
        recordedAt: FieldValue.serverTimestamp(),
        occurredAt: FieldValue.serverTimestamp(),
        notes,
        reversed: false,
      });

      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: 'adjustment',
        actorUid: admin.uid,
        actorName: admin.fullName,
        targetType: locationType,
        targetId: locationId,
        targetName: locationName,
        shopId,
        shopName,
        movementId: movementRef.id,
        notes,
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
    console.error('Stock adjust error:', e);
    return NextResponse.json({ success: false, error: 'Failed to adjust stock' }, { status: 500 });
  }
}
