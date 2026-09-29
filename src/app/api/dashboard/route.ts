import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuth, hasShopPermission } from '@/lib/auth/verify';

// GET /api/dashboard?shopId=xxx
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shopId');

    if (!shopId) {
      return NextResponse.json({ success: false, error: 'shopId required' }, { status: 400 });
    }

    // Permission check
    if (!hasShopPermission(user, shopId, 'view')) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Get shop data
    const shopDoc = await adminDb.collection('shops').doc(shopId).get();
    if (!shopDoc.exists) {
      return NextResponse.json({ success: false, error: 'Shop not found' }, { status: 404 });
    }
    const shopData = shopDoc.data()!;
    const linkedWarehouseIds = shopData.linkedWarehouseIds || [];

    // Get shop stock
    const shopStockSnap = await adminDb.collection('stockBalances')
      .where('locationId', '==', shopId)
      .get();
    const shopStockCount = shopStockSnap.docs.reduce((sum, doc) => sum + (doc.data().quantity || 0), 0);

    // Get warehouse stock (linked warehouses only, no double counting)
    let warehouseStockCount = 0;
    for (const whId of linkedWarehouseIds) {
      const whStockSnap = await adminDb.collection('stockBalances')
        .where('locationId', '==', whId)
        .get();
      warehouseStockCount += whStockSnap.docs.reduce((sum, doc) => sum + (doc.data().quantity || 0), 0);
    }

    // Today's metrics
    const now = new Date();
    const tz = process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE || 'Asia/Karachi';
    // Calculate start of business day
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz });
    const todayStart = new Date(todayStr + 'T00:00:00');
    const todayEnd = new Date(todayStr + 'T23:59:59');

    // Today's received (into linked warehouses)
    let todayReceived = 0;
    for (const whId of linkedWarehouseIds) {
      const receivedSnap = await adminDb.collection('stockMovements')
        .where('type', '==', 'stock_received')
        .where('destLocationId', '==', whId)
        .where('recordedAt', '>=', todayStart)
        .where('recordedAt', '<=', todayEnd)
        .get();
      for (const doc of receivedSnap.docs) {
        const data = doc.data();
        if (!data.reversed) {
          todayReceived += (data.lineItems || []).reduce((s: number, li: Record<string, unknown>) => s + (Number(li.quantity) || 0), 0);
        }
      }
    }

    // Today's transfers into this shop
    const transferSnap = await adminDb.collection('stockMovements')
      .where('type', '==', 'warehouse_to_shop_transfer')
      .where('destLocationId', '==', shopId)
      .where('recordedAt', '>=', todayStart)
      .where('recordedAt', '<=', todayEnd)
      .get();
    let todayTransferred = 0;
    for (const doc of transferSnap.docs) {
      const data = doc.data();
      if (!data.reversed) {
        todayTransferred += (data.lineItems || []).reduce((s: number, li: Record<string, unknown>) => s + (Number(li.quantity) || 0), 0);
      }
    }

    // Today's sales from this shop
    const saleSnap = await adminDb.collection('stockMovements')
      .where('type', '==', 'sale')
      .where('sourceLocationId', '==', shopId)
      .where('recordedAt', '>=', todayStart)
      .where('recordedAt', '<=', todayEnd)
      .get();
    let todaySold = 0;
    for (const doc of saleSnap.docs) {
      const data = doc.data();
      if (!data.reversed) {
        todaySold += (data.lineItems || []).reduce((s: number, li: Record<string, unknown>) => s + (Number(li.quantity) || 0), 0);
      }
    }

    // Low stock products
    const productsSnap = await adminDb.collection('products').where('active', '==', true).get();
    let lowStockProducts = 0;
    for (const prodDoc of productsSnap.docs) {
      const prodData = prodDoc.data();
      if (prodData.lowStockThreshold != null && prodData.lowStockThreshold > 0) {
        // Check balance at shop
        const balanceId = `${shopId}_${prodDoc.id}`;
        const balDoc = await adminDb.collection('stockBalances').doc(balanceId).get();
        const qty = balDoc.exists ? balDoc.data()!.quantity : 0;
        if (qty <= prodData.lowStockThreshold) {
          lowStockProducts++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        shopName: shopData.name,
        shopStockCount,
        warehouseStockCount,
        todayReceived,
        todayTransferred,
        todaySold,
        lowStockProducts,
        linkedWarehouses: linkedWarehouseIds.length,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Dashboard error:', e);
    return NextResponse.json({ success: false, error: 'Failed to load dashboard' }, { status: 500 });
  }
}
