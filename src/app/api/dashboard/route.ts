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

    // Low stock products for this shop
    const productsSnap = await adminDb.collection('products')
      .where('shopId', '==', shopId)
      .where('active', '==', true)
      .get();

    // Map balances
    const allShopBalancesSnap = await adminDb.collection('stockBalances')
      .where('shopId', '==', shopId)
      .get();

    const shopStockByProd: Record<string, number> = {};
    const whStockByProd: Record<string, number> = {};

    allShopBalancesSnap.docs.forEach(doc => {
      const d = doc.data();
      const pId = d.productId as string;
      const qty = Number(d.quantity) || 0;
      if (d.locationType === 'shop' || d.locationId === shopId) {
        shopStockByProd[pId] = (shopStockByProd[pId] || 0) + qty;
      } else if (d.locationType === 'warehouse' || linkedWarehouseIds.includes(d.locationId)) {
        whStockByProd[pId] = (whStockByProd[pId] || 0) + qty;
      }
    });

    const lowStockItems: Array<{
      id: string;
      name: string;
      sku: string;
      currentQty: number;
      threshold: number;
      warehouseQty: number;
    }> = [];

    for (const prodDoc of productsSnap.docs) {
      const prodData = prodDoc.data();
      const threshold = prodData.lowStockThreshold ?? 10;
      if (threshold > 0) {
        const currentQty = shopStockByProd[prodDoc.id] || 0;
        if (currentQty <= threshold) {
          lowStockItems.push({
            id: prodDoc.id,
            name: prodData.name,
            sku: prodData.sku,
            currentQty,
            threshold,
            warehouseQty: whStockByProd[prodDoc.id] || 0,
          });
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
        lowStockProducts: lowStockItems.length,
        lowStockItems,
        linkedWarehouses: linkedWarehouseIds.length,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Dashboard error:', e);
    return NextResponse.json({ success: false, error: 'Failed to load dashboard' }, { status: 500 });
  }
}
