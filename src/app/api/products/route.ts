import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuth, requireAdmin } from '@/lib/auth/verify';
import { FieldValue } from 'firebase-admin/firestore';

// GET /api/products - List products (requires auth)
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shopId');
    const activeOnly = url.searchParams.get('active') !== 'false';
    const search = url.searchParams.get('search')?.toLowerCase();

    if (!shopId) {
      return NextResponse.json({ success: false, error: 'shopId is required' }, { status: 400 });
    }

    // Permission check
    const user = await requireAuth(request);
    const hasAccess = user.role === 'admin' || user.shopPermissions?.[shopId]?.view === true;
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    let query = adminDb.collection('products')
      .where('shopId', '==', shopId) as FirebaseFirestore.Query;

    const snapshot = await query.get();
    let products = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));

    if (activeOnly) {
      products = products.filter((p: any) => p.active === true);
    }

    products.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

    // Client-side search filter (Firestore doesn't support case-insensitive search)
    if (search) {
      products = products.filter((p: any) => 
        p.name?.toString().toLowerCase().includes(search) ||
        p.sku?.toString().toLowerCase().includes(search)
      );
    }

    return NextResponse.json({ success: true, data: products });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('List products error:', e);
    return NextResponse.json({ success: false, error: 'Failed to load products' }, { status: 500 });
  }
}

// POST /api/products - Create product (admin only)
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();

    const name = body.name?.trim();
    if (!name || name.length > 200) {
      return NextResponse.json({ success: false, error: 'Product name required (max 200 chars)' }, { status: 400 });
    }

    const sku = body.sku?.trim();
    if (!sku || sku.length > 50) {
      return NextResponse.json({ success: false, error: 'SKU required (max 50 chars)' }, { status: 400 });
    }

    const shopId = body.shopId;
    if (!shopId) {
      return NextResponse.json({ success: false, error: 'shopId is required' }, { status: 400 });
    }

    // Check SKU uniqueness WITHIN THE SHOP
    const skuCheck = await adminDb.collection('products')
      .where('shopId', '==', shopId)
      .where('sku', '==', sku)
      .get();
    if (!skuCheck.empty) {
      return NextResponse.json({ success: false, error: `SKU "${sku}" already exists in this shop` }, { status: 409 });
    }

    const unit = body.unit?.trim() || 'pcs';
    const lowStockThreshold = body.lowStockThreshold != null ? Number(body.lowStockThreshold) : null;
    const fractionalUnits = Boolean(body.fractionalUnits);

    const productRef = adminDb.collection('products').doc();

    await adminDb.runTransaction(async (txn) => {
      txn.set(productRef, {
        name,
        sku,
        shopId,
        unit,
        active: true,
        lowStockThreshold,
        fractionalUnits,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: 'product_created',
        actorUid: admin.uid,
        actorName: admin.fullName,
        targetType: 'product',
        targetId: productRef.id,
        targetName: name,
        after: { name, sku, unit, lowStockThreshold, fractionalUnits },
        timestamp: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ success: true, data: { id: productRef.id, name, sku } }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Create product error:', e);
    return NextResponse.json({ success: false, error: 'Failed to create product' }, { status: 500 });
  }
}

// PATCH /api/products - Update product (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Product ID required' }, { status: 400 });
    }

    const prodRef = adminDb.collection('products').doc(id);
    const prodDoc = await prodRef.get();
    if (!prodDoc.exists) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    const oldData = prodDoc.data()!;
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    if (body.name !== undefined) {
      const trimmedName = body.name.trim();
      if (!trimmedName || trimmedName.length > 200) {
        return NextResponse.json({ success: false, error: 'Invalid product name' }, { status: 400 });
      }
      updates.name = trimmedName;
    }

    if (body.unit !== undefined) updates.unit = body.unit.trim() || 'pcs';
    if (body.active !== undefined) updates.active = Boolean(body.active);
    if (body.lowStockThreshold !== undefined) {
      updates.lowStockThreshold = body.lowStockThreshold != null ? Number(body.lowStockThreshold) : null;
    }
    if (body.fractionalUnits !== undefined) updates.fractionalUnits = Boolean(body.fractionalUnits);

    await adminDb.runTransaction(async (txn) => {
      txn.update(prodRef, updates);

      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: 'product_updated',
        actorUid: admin.uid,
        actorName: admin.fullName,
        targetType: 'product',
        targetId: id,
        targetName: updates.name || oldData.name,
        before: { name: oldData.name, unit: oldData.unit, active: oldData.active, lowStockThreshold: oldData.lowStockThreshold },
        after: { ...updates },
        timestamp: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Update product error:', e);
    return NextResponse.json({ success: false, error: 'Failed to update product' }, { status: 500 });
  }
}
