import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuth, requireAdmin } from '@/lib/auth/verify';
import { FieldValue } from 'firebase-admin/firestore';

// GET /api/shops - List shops (filtered by user permissions)
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const snapshot = await adminDb.collection('shops').where('active', '==', true).get();
    const shops = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
      }))
      .filter(shop => {
        // Admin sees all shops
        if (user.role === 'admin') return true;
        // Staff sees only permitted shops
        return user.shopPermissions[shop.id]?.view === true;
      });

    return NextResponse.json({ success: true, data: shops });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('List shops error:', e);
    return NextResponse.json({ success: false, error: 'Failed to load shops' }, { status: 500 });
  }
}

// POST /api/shops - Create a new shop (admin only)
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();

    const name = body.name?.trim();
    if (!name || name.length < 1 || name.length > 50) {
      return NextResponse.json({ success: false, error: 'Shop name is required (1-50 chars)' }, { status: 400 });
    }

    const linkedWarehouseIds = Array.isArray(body.linkedWarehouseIds) ? body.linkedWarehouseIds : [];

    // Verify all warehouse IDs exist
    for (const whId of linkedWarehouseIds) {
      const whDoc = await adminDb.collection('warehouses').doc(whId).get();
      if (!whDoc.exists) {
        return NextResponse.json({ success: false, error: `Warehouse ${whId} not found` }, { status: 404 });
      }
    }

    const shopRef = adminDb.collection('shops').doc();
    
    await adminDb.runTransaction(async (txn) => {
      txn.set(shopRef, {
        name,
        linkedWarehouseIds,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: 'shop_created',
        actorUid: admin.uid,
        actorName: admin.fullName,
        targetType: 'shop',
        targetId: shopRef.id,
        targetName: name,
        after: { name, linkedWarehouseIds },
        timestamp: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ success: true, data: { id: shopRef.id, name } }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Create shop error:', e);
    return NextResponse.json({ success: false, error: 'Failed to create shop' }, { status: 500 });
  }
}

// PATCH /api/shops - Update shop (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const { id, name, linkedWarehouseIds } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Shop ID required' }, { status: 400 });
    }

    const shopRef = adminDb.collection('shops').doc(id);
    const shopDoc = await shopRef.get();

    if (!shopDoc.exists) {
      return NextResponse.json({ success: false, error: 'Shop not found' }, { status: 404 });
    }

    const oldData = shopDoc.data()!;
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName || trimmedName.length > 50) {
        return NextResponse.json({ success: false, error: 'Invalid shop name' }, { status: 400 });
      }
      updates.name = trimmedName;
    }

    if (linkedWarehouseIds !== undefined) {
      if (!Array.isArray(linkedWarehouseIds)) {
        return NextResponse.json({ success: false, error: 'linkedWarehouseIds must be an array' }, { status: 400 });
      }
      // Verify warehouses
      for (const whId of linkedWarehouseIds) {
        const whDoc = await adminDb.collection('warehouses').doc(whId).get();
        if (!whDoc.exists) {
          return NextResponse.json({ success: false, error: `Warehouse ${whId} not found` }, { status: 404 });
        }
      }
      updates.linkedWarehouseIds = linkedWarehouseIds;
    }

    await adminDb.runTransaction(async (txn) => {
      txn.update(shopRef, updates);

      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: linkedWarehouseIds !== undefined ? 'shop_link_changed' : 'shop_updated',
        actorUid: admin.uid,
        actorName: admin.fullName,
        targetType: 'shop',
        targetId: id,
        targetName: updates.name || oldData.name,
        before: {
          name: oldData.name,
          linkedWarehouseIds: oldData.linkedWarehouseIds,
        },
        after: {
          name: updates.name || oldData.name,
          linkedWarehouseIds: updates.linkedWarehouseIds || oldData.linkedWarehouseIds,
        },
        timestamp: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Update shop error:', e);
    return NextResponse.json({ success: false, error: 'Failed to update shop' }, { status: 500 });
  }
}
