import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuth, requireAdmin } from '@/lib/auth/verify';
import { FieldValue } from 'firebase-admin/firestore';

// GET /api/warehouses - List warehouses
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shopId');

    if (!shopId) {
      return NextResponse.json({ success: false, error: 'shopId is required' }, { status: 400 });
    }

    const user = await requireAuth(request);
    const hasAccess = user.role === 'admin' || user.shopPermissions?.[shopId]?.view === true;
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const snapshot = await adminDb.collection('warehouses')
      .where('shopId', '==', shopId)
      .get();
    const warehouses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({ success: true, data: warehouses });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('List warehouses error:', e);
    return NextResponse.json({ success: false, error: 'Failed to load warehouses' }, { status: 500 });
  }
}

// POST /api/warehouses - Create warehouse (admin only)
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();

    const name = body.name?.trim();
    if (!name || name.length < 1 || name.length > 50) {
      return NextResponse.json({ success: false, error: 'Warehouse name required (1-50 chars)' }, { status: 400 });
    }

    const shopId = body.shopId;
    if (!shopId) {
      return NextResponse.json({ success: false, error: 'shopId is required' }, { status: 400 });
    }

    const whRef = adminDb.collection('warehouses').doc();

    await adminDb.runTransaction(async (txn) => {
      txn.set(whRef, {
        name,
        shopId,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: 'warehouse_created',
        actorUid: admin.uid,
        actorName: admin.fullName,
        targetType: 'warehouse',
        targetId: whRef.id,
        targetName: name,
        after: { name },
        timestamp: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ success: true, data: { id: whRef.id, name } }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Create warehouse error:', e);
    return NextResponse.json({ success: false, error: 'Failed to create warehouse' }, { status: 500 });
  }
}

// PATCH /api/warehouses - Update warehouse (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const { id, name, active } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Warehouse ID required' }, { status: 400 });
    }

    const whRef = adminDb.collection('warehouses').doc(id);
    const whDoc = await whRef.get();

    if (!whDoc.exists) {
      return NextResponse.json({ success: false, error: 'Warehouse not found' }, { status: 404 });
    }

    const oldData = whDoc.data()!;
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName || trimmedName.length > 50) {
        return NextResponse.json({ success: false, error: 'Invalid warehouse name' }, { status: 400 });
      }
      updates.name = trimmedName;
    }

    if (active !== undefined) {
      updates.active = Boolean(active);
    }

    await adminDb.runTransaction(async (txn) => {
      txn.update(whRef, updates);

      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: 'warehouse_updated',
        actorUid: admin.uid,
        actorName: admin.fullName,
        targetType: 'warehouse',
        targetId: id,
        targetName: updates.name || oldData.name,
        before: { name: oldData.name, active: oldData.active },
        after: { name: updates.name || oldData.name, active: updates.active ?? oldData.active },
        timestamp: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Update warehouse error:', e);
    return NextResponse.json({ success: false, error: 'Failed to update warehouse' }, { status: 500 });
  }
}
