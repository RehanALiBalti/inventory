import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/verify';
import { FieldValue } from 'firebase-admin/firestore';
import { ShopPermissions } from '@/types';

// PUT /api/staff/permissions - Update staff shop permissions (admin only)
export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const { uid, shopPermissions } = body;

    if (!uid || typeof uid !== 'string') {
      return NextResponse.json({ success: false, error: 'User ID required' }, { status: 400 });
    }

    if (uid === admin.uid) {
      return NextResponse.json({ success: false, error: 'Cannot modify your own permissions' }, { status: 400 });
    }

    // Validate shopPermissions structure
    if (!shopPermissions || typeof shopPermissions !== 'object') {
      return NextResponse.json({ success: false, error: 'Shop permissions object required' }, { status: 400 });
    }

    // Validate each shop permission entry
    const validatedPerms: Record<string, ShopPermissions> = {};
    for (const [shopId, perms] of Object.entries(shopPermissions)) {
      const p = perms as ShopPermissions;
      // Transfer and sale require view
      if ((p.transfer || p.recordSale) && !p.view) {
        return NextResponse.json(
          { success: false, error: `Transfer/sale permissions require view access for shop ${shopId}` },
          { status: 400 }
        );
      }
      validatedPerms[shopId] = {
        view: Boolean(p.view),
        transfer: Boolean(p.transfer),
        recordSale: Boolean(p.recordSale),
      };
    }

    // Verify all shop IDs exist
    for (const shopId of Object.keys(validatedPerms)) {
      const shopDoc = await adminDb.collection('shops').doc(shopId).get();
      if (!shopDoc.exists) {
        return NextResponse.json(
          { success: false, error: `Shop ${shopId} not found` },
          { status: 404 }
        );
      }
    }

    const userRef = adminDb.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data()!;
    const oldPerms = userData.shopPermissions || {};

    await adminDb.runTransaction(async (txn) => {
      txn.update(userRef, {
        shopPermissions: validatedPerms,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: 'permissions_updated',
        actorUid: admin.uid,
        actorName: admin.fullName,
        targetType: 'user',
        targetId: uid,
        targetName: userData.fullName,
        before: { shopPermissions: oldPerms },
        after: { shopPermissions: validatedPerms },
        timestamp: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ success: true, data: { uid, shopPermissions: validatedPerms } });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Update permissions error:', e);
    return NextResponse.json({ success: false, error: 'Failed to update permissions' }, { status: 500 });
  }
}
