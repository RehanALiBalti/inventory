import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/verify';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth } from '@/lib/firebase/admin';

// GET /api/staff - List all staff members (admin only)
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    
    const snapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
    const users = snapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({ success: true, data: users });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('List staff error:', e);
    return NextResponse.json({ success: false, error: 'Failed to load staff' }, { status: 500 });
  }
}

// PATCH /api/staff - Update staff status (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const { uid, action } = body;

    if (!uid || typeof uid !== 'string') {
      return NextResponse.json({ success: false, error: 'User ID required' }, { status: 400 });
    }

    const validActions = ['approve', 'reject', 'disable', 'enable'];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { success: false, error: `Action must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      );
    }

    // Prevent self-modification
    if (uid === admin.uid) {
      return NextResponse.json({ success: false, error: 'Cannot modify your own account' }, { status: 400 });
    }

    const userRef = adminDb.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data()!;
    const oldStatus = userData.status;

    const statusMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      disable: 'disabled',
      enable: 'approved',
    };

    const newStatus = statusMap[action];

    await adminDb.runTransaction(async (txn) => {
      txn.update(userRef, {
        status: newStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create audit log
      const auditRef = adminDb.collection('auditLogs').doc();
      txn.set(auditRef, {
        action: `user_${action === 'enable' ? 'enabled' : action + (action.endsWith('e') ? 'd' : 'ed')}` as string,
        actorUid: admin.uid,
        actorName: admin.fullName,
        targetType: 'user',
        targetId: uid,
        targetName: userData.fullName,
        before: { status: oldStatus },
        after: { status: newStatus },
        timestamp: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ success: true, data: { uid, status: newStatus } });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Update staff error:', e);
    return NextResponse.json({ success: false, error: 'Failed to update staff' }, { status: 500 });
  }
}

// DELETE /api/staff - Delete a staff member completely (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid');

    if (!uid) {
      return NextResponse.json({ success: false, error: 'User ID required' }, { status: 400 });
    }
    if (uid === admin.uid) {
      return NextResponse.json({ success: false, error: 'Cannot delete your own account' }, { status: 400 });
    }

    const userRef = adminDb.collection('users').doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Delete from Firestore
    await userRef.delete();
    // Delete from Auth
    try {
      await adminAuth.deleteUser(uid);
    } catch (e) {
      console.warn('Could not delete auth user, maybe already deleted:', e);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Delete staff error:', e);
    return NextResponse.json({ success: false, error: 'Failed to delete staff' }, { status: 500 });
  }
}

// POST /api/staff - Create a new staff member manually (admin only)
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const { email, password, fullName, role } = body;

    if (!email || !password || !fullName || !role) {
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
    }

    // 1. Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: fullName,
    });

    // 2. Create user document in Firestore
    await adminDb.collection('users').doc(userRecord.uid).set({
      email,
      fullName,
      role,
      status: 'approved',
      shopPermissions: {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, data: { uid: userRecord.uid, email, fullName, role } });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error('Create staff error:', e);
    return NextResponse.json({ success: false, error: e.message || 'Failed to create staff' }, { status: 500 });
  }
}

// PUT /api/staff - Update staff details (admin only)
export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const { uid, fullName, role } = body;

    if (!uid || !fullName || !role) {
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
    }

    if (uid === admin.uid) {
      return NextResponse.json({ success: false, error: 'Cannot modify your own account' }, { status: 400 });
    }

    const userRef = adminDb.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    await adminDb.runTransaction(async (txn) => {
      txn.update(userRef, {
        fullName,
        role,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // Also update auth displayName
    try {
      await adminAuth.updateUser(uid, {
        displayName: fullName,
      });
    } catch(e) {
       console.warn('Could not update auth display name:', e);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error('Update staff error:', e);
    return NextResponse.json({ success: false, error: e.message || 'Failed to update staff' }, { status: 500 });
  }
}
