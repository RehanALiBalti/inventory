import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    // Verify the token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    // Check if user doc already exists (prevent duplicate registration)
    const existingDoc = await adminDb.collection('users').doc(uid).get();
    if (existingDoc.exists) {
      return NextResponse.json({ success: true, data: { uid } });
    }

    // Parse request body
    const body = await request.json();
    const fullName = body.fullName?.trim();

    if (!fullName || fullName.length < 2 || fullName.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Full name must be between 2 and 100 characters' },
        { status: 400 }
      );
    }

    // Always create as staff/pending with no permissions
    await adminDb.collection('users').doc(uid).set({
      email: decoded.email || '',
      fullName,
      role: 'staff',
      status: 'pending',
      shopPermissions: {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, data: { uid } }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { success: false, error: 'Registration failed' },
      { status: 500 }
    );
  }
}
