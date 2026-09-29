import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/verify';

// GET /api/audit - Query audit logs (admin only)
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);

    const action = url.searchParams.get('action');
    const actorUid = url.searchParams.get('actorUid');
    const shopId = url.searchParams.get('shopId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const targetId = url.searchParams.get('targetId');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);

    let query = adminDb.collection('auditLogs')
      .orderBy('timestamp', 'desc') as FirebaseFirestore.Query;

    if (action) query = query.where('action', '==', action);
    if (actorUid) query = query.where('actorUid', '==', actorUid);
    if (shopId) query = query.where('shopId', '==', shopId);
    if (targetId) query = query.where('targetId', '==', targetId);
    if (startDate) query = query.where('timestamp', '>=', new Date(startDate));
    if (endDate) query = query.where('timestamp', '<=', new Date(endDate + 'T23:59:59'));

    query = query.limit(limit);

    const snapshot = await query.get();
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({ success: true, data: logs });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Audit logs error:', e);
    return NextResponse.json({ success: false, error: 'Failed to load audit logs' }, { status: 500 });
  }
}
