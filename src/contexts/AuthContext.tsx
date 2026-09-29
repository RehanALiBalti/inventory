'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';
import { UserRecord, UserRole, UserStatus, ShopPermissions } from '@/types';

interface AuthContextType {
  firebaseUser: User | null;
  userRecord: UserRecord | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  getIdToken: () => Promise<string | null>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userRecord, setUserRecord] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) {
        setUserRecord(null);
        setLoading(false);
      }
    });
    return () => unsubAuth();
  }, []);

  // Listen to Firestore user document when authenticated
  useEffect(() => {
    if (!firebaseUser) return;

    const unsubDoc = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snapshot) => {
        if (snapshot.exists()) {
          setUserRecord({ uid: snapshot.id, ...snapshot.data() } as UserRecord);
        } else {
          setUserRecord(null);
        }
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => unsubDoc();
  }, [firebaseUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        setError('Invalid email or password');
      } else if (msg.includes('too-many-requests')) {
        setError('Too many attempts. Please try again later.');
      } else {
        setError('Sign in failed. Please try again.');
      }
      throw err;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    setError(null);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      // Create user doc via API (not direct Firestore write)
      const token = await credential.user.getIdToken();
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ fullName: fullName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Registration failed');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      if (msg.includes('email-already-in-use')) {
        setError('An account with this email already exists');
      } else if (msg.includes('weak-password')) {
        setError('Password must be at least 6 characters');
      } else if (msg.includes('invalid-email')) {
        setError('Invalid email address');
      } else {
        setError(msg);
      }
      throw err;
    }
  }, []);

  const signOutFn = useCallback(async () => {
    await firebaseSignOut(auth);
    setUserRecord(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Password reset failed';
      if (msg.includes('user-not-found')) {
        // Don't reveal if user exists
        return;
      }
      setError('Password reset failed. Please try again.');
      throw err;
    }
  }, []);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!firebaseUser) return null;
    try {
      return await firebaseUser.getIdToken();
    } catch {
      return null;
    }
  }, [firebaseUser]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userRecord,
        loading,
        error,
        signIn,
        signUp,
        signOut: signOutFn,
        resetPassword,
        getIdToken,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper hooks
export function useIsAdmin(): boolean {
  const { userRecord } = useAuth();
  return userRecord?.role === 'admin';
}

export function useIsApproved(): boolean {
  const { userRecord } = useAuth();
  return userRecord?.status === 'approved';
}

export function useHasShopPermission(shopId: string | null, permission: keyof ShopPermissions): boolean {
  const { userRecord } = useAuth();
  if (!userRecord || !shopId) return false;
  if (userRecord.role === 'admin') return true;
  const perms = userRecord.shopPermissions?.[shopId];
  if (!perms?.view) return false;
  return perms[permission] === true;
}
