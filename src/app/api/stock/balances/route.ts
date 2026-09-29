import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuth, hasShopPermission } from '@/lib/auth/verify';

// GET /api/stock/balances?shopId=xxx&locationType=shop|warehouse
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shopId');
    const locationType = url.searchParams.get('locationType');
    const locationId = url.searchParams.get('locationId');

    if (!shopId) {
      return NextResponse.json({ success: false, error: 'shopId required' }, { status: 400 });
    }

    if (!hasShopPermission(user, shopId, 'view')) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    let query = adminDb.collection('stockBalances')
      .where('shopId', '==', shopId);

    if (locationType) {
      query = query.where('locationType', '==', locationType);
    }
    
    if (locationId) {
      query = query.where('locationId', '==', locationId);
    }

    const snapshot = await query.get();

    const balances = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({ success: true, data: balances });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Balances error:', e);
    return NextResponse.json({ success: false, error: 'Failed to load balances' }, { status: 500 });
  }
}
