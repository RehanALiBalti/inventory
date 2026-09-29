// Server-side auth verification utilities
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { NextRequest } from 'next/server';
import { UserRecord, UserRole, ShopPermissions } from '@/types';

export interface VerifiedUser {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: string;
  shopPermissions: Record<string, ShopPermissions>;
}

/**
 * Verify the Firebase ID token from the Authorization header.
 * Returns null if invalid/missing.
 */
export async function verifyAuth(request: NextRequest): Promise<VerifiedUser | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.split('Bearer ')[1];
    if (!token) return null;

    const decoded = await adminAuth.verifyIdToken(token);
    
    // Fetch the user document from Firestore
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists) return null;

    const userData = userDoc.data() as UserRecord;

    return {
      uid: decoded.uid,
      email: userData.email || decoded.email || '',
      fullName: userData.fullName || '',
      role: userData.role,
      status: userData.status,
      shopPermissions: userData.shopPermissions || {},
    };
  } catch {
    return null;
  }
}

/**
 * Require the user to be authenticated and approved.
 * Returns the verified user or throws an error response.
 */
export async function requireAuth(request: NextRequest): Promise<VerifiedUser> {
  const user = await verifyAuth(request);
  if (!user) {
    throw new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (user.status !== 'approved') {
    throw new Response(
      JSON.stringify({ success: false, error: `Account is ${user.status}. Access denied.` }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return user;
}

/**
 * Require the user to be an approved admin.
 */
export async function requireAdmin(request: NextRequest): Promise<VerifiedUser> {
  const user = await requireAuth(request);
  if (user.role !== 'admin') {
    throw new Response(
      JSON.stringify({ success: false, error: 'Admin access required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return user;
}

/**
 * Check if user has specific shop permission.
 */
export function hasShopPermission(
  user: VerifiedUser,
  shopId: string,
  permission: keyof ShopPermissions
): boolean {
  if (user.role === 'admin') return true;
  const perms = user.shopPermissions[shopId];
  if (!perms || !perms.view) return false;
  return perms[permission] === true;
}

/**
 * Verify a warehouse is linked to a shop.
 */
export async function verifyWarehouseShopLink(
  warehouseId: string,
  shopId: string
): Promise<boolean> {
  const shopDoc = await adminDb.collection('shops').doc(shopId).get();
  if (!shopDoc.exists) return false;
  const shop = shopDoc.data();
  return shop?.linkedWarehouseIds?.includes(warehouseId) ?? false;
}
