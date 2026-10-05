import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuth, hasShopPermission } from '@/lib/auth/verify';

// GET /api/stock/movements - Query stock movements with filters
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const url = new URL(request.url);

    const shopId = url.searchParams.get('shopId');
    const type = url.searchParams.get('type');
    const actorUid = url.searchParams.get('actorUid');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const locationId = url.searchParams.get('locationId');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const ownOnly = url.searchParams.get('ownOnly') === 'true';
    const cursor = url.searchParams.get('cursor');

    let query = adminDb.collection('stockMovements')
      .orderBy('recordedAt', 'desc') as FirebaseFirestore.Query;

    // Staff can only see their own shop-scoped movements
    if (user.role !== 'admin') {
      if (ownOnly || !shopId) {
        query = query.where('actorUid', '==', user.uid);
      } else if (shopId) {
        if (!hasShopPermission(user, shopId, 'view')) {
          return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
        }
        query = query.where('shopId', '==', shopId);
      }
    } else {
      // Admin filters
      if (shopId) {
        query = query.where('shopId', '==', shopId);
      }
      if (actorUid) {
        query = query.where('actorUid', '==', actorUid);
      }
    }

    if (type) {
      query = query.where('type', '==', type);
    }

    if (locationId) {
      // Can't do OR in Firestore easily, so we do two queries
      // For now, filter source
      query = query.where('sourceLocationId', '==', locationId);
    }

    if (startDate) {
      query = query.where('recordedAt', '>=', new Date(startDate));
    }
    if (endDate) {
      query = query.where('recordedAt', '<=', new Date(endDate + 'T23:59:59'));
    }

    if (cursor) {
      const cursorSnap = await adminDb.collection('stockMovements').doc(cursor).get();
      if (cursorSnap.exists) {
        query = query.startAfter(cursorSnap);
      }
    }

    query = query.limit(limit);

    const snapshot = await query.get();
    const movements = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      recordedAt: doc.data().recordedAt?.toDate?.()?.toISOString() || null,
      occurredAt: doc.data().occurredAt?.toDate?.()?.toISOString() || doc.data().occurredAt || null,
    }));

    const nextCursor = snapshot.docs.length === limit
      ? snapshot.docs[snapshot.docs.length - 1].id
      : null;

    return NextResponse.json({ success: true, data: movements, nextCursor });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Movements query error:', e);
    return NextResponse.json({ success: false, error: 'Failed to load movements' }, { status: 500 });
  }
}
