import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuth, hasShopPermission } from '@/lib/auth/verify';

// GET /api/stock/warehouse-summary?shopId=xxx
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shopId');

    if (!shopId) {
      return NextResponse.json({ success: false, error: 'shopId required' }, { status: 400 });
    }

    if (!hasShopPermission(user, shopId, 'view')) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // 1. Fetch shop doc
    const shopDoc = await adminDb.collection('shops').doc(shopId).get();
    if (!shopDoc.exists) {
      return NextResponse.json({ success: false, error: 'Shop not found' }, { status: 404 });
    }
    const shopData = shopDoc.data()!;
    const linkedWarehouseIds = new Set<string>(shopData.linkedWarehouseIds || []);

    // 2. Fetch warehouses for this shop
    const whSnap = await adminDb.collection('warehouses')
      .where('shopId', '==', shopId)
      .where('active', '==', true)
      .get();
    const warehouses = whSnap.docs.map(d => ({
      id: d.id,
      name: d.data().name as string,
    }));
    whSnap.docs.forEach(d => linkedWarehouseIds.add(d.id));

    // 3. Fetch products for this shop
    const prodSnap = await adminDb.collection('products')
      .where('shopId', '==', shopId)
      .get();
    const products = prodSnap.docs.map(d => ({
      id: d.id,
      name: d.data().name as string,
      sku: d.data().sku as string,
      unit: (d.data().unit as string) || 'pcs',
      active: d.data().active ?? true,
      lowStockThreshold: d.data().lowStockThreshold ?? null,
    }));

    // 4. Fetch all balances for this shop
    const balSnap = await adminDb.collection('stockBalances')
      .where('shopId', '==', shopId)
      .get();

    const warehouseBalanceMap: Record<string, number> = {};
    const shopBalanceMap: Record<string, number> = {};

    balSnap.docs.forEach(doc => {
      const data = doc.data();
      const pId = data.productId as string;
      const qty = Number(data.quantity) || 0;
      const locType = data.locationType as string;
      const locId = data.locationId as string;

      if (locType === 'warehouse' || linkedWarehouseIds.has(locId)) {
        warehouseBalanceMap[pId] = (warehouseBalanceMap[pId] || 0) + qty;
      } else if (locType === 'shop' || locId === shopId) {
        shopBalanceMap[pId] = (shopBalanceMap[pId] || 0) + qty;
      }
    });

    // 5. Fetch all movements for this shop to aggregate received, transferred, and sold
    const movSnap = await adminDb.collection('stockMovements')
      .where('shopId', '==', shopId)
      .get();

    const productReceivedMap: Record<string, number> = {};
    const productTransferredMap: Record<string, number> = {};
    const productSoldMap: Record<string, number> = {};

    movSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.reversed) return;

      const type = data.type as string;
      const lineItems = (data.lineItems || []) as Array<{ productId: string; quantity: number }>;

      lineItems.forEach(li => {
        const qty = Number(li.quantity) || 0;
        if (!li.productId) return;

        if (type === 'stock_received') {
          productReceivedMap[li.productId] = (productReceivedMap[li.productId] || 0) + qty;
        } else if (type === 'warehouse_to_shop_transfer') {
          productTransferredMap[li.productId] = (productTransferredMap[li.productId] || 0) + qty;
        } else if (type === 'sale') {
          productSoldMap[li.productId] = (productSoldMap[li.productId] || 0) + qty;
        }
      });
    });

    // 6. Build comprehensive items list
    let totalWarehouseStock = 0;
    let totalShopStock = 0;
    let totalSoldAll = 0;
    let totalReceivedAll = 0;

    const items = products.map(p => {
      const whStock = warehouseBalanceMap[p.id] || 0;
      const shStock = shopBalanceMap[p.id] || 0;
      const sold = productSoldMap[p.id] || 0;
      const transferred = productTransferredMap[p.id] || 0;
      const rec = productReceivedMap[p.id] || 0;

      // Real or calculated initial received:
      // If no explicit received movement was recorded (e.g. initial inventory seed),
      // initial total = current warehouse + current shop + sold
      const initialStock = Math.max(rec, whStock + shStock + sold);

      totalWarehouseStock += whStock;
      totalShopStock += shStock;
      totalSoldAll += sold;
      totalReceivedAll += initialStock;

      const threshold = p.lowStockThreshold ?? 10;
      let status: 'in_stock' | 'low_stock' | 'out_of_stock' = 'in_stock';
      if (whStock <= 0) {
        status = 'out_of_stock';
      } else if (whStock <= threshold) {
        status = 'low_stock';
      }

      return {
        productId: p.id,
        productName: p.name,
        productSku: p.sku,
        unit: p.unit,
        active: p.active,
        totalReceived: initialStock,
        warehouseStock: whStock,
        shopStock: shStock,
        transferredToShop: transferred,
        totalSold: sold,
        status,
        lowStockThreshold: threshold,
      };
    });

    // Sort by product name
    items.sort((a, b) => a.productName.localeCompare(b.productName));

    return NextResponse.json({
      success: true,
      data: {
        warehouses,
        metrics: {
          totalWarehouseStock,
          totalShopStock,
          totalSold: totalSoldAll,
          totalReceived: totalReceivedAll,
          totalProducts: items.length,
        },
        items,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Warehouse summary error:', e);
    return NextResponse.json({ success: false, error: 'Failed to load warehouse summary' }, { status: 500 });
  }
}
