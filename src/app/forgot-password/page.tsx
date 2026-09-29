'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input, Alert } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { resetPassword, error, clearError } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!email.trim()) return;

    setLoading(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch {
      // Error handled in context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-50">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-surface-900">Reset Password</h1>
          <p className="text-sm text-surface-400 mt-1">
            Enter your email to receive a password reset link
          </p>
        </div>

        <div className="glass-card p-8">
          {sent ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-500/15 mb-4">
                <svg className="w-8 h-8 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-surface-900 mb-2">Check your email</h3>
              <p className="text-sm text-surface-400 mb-6">
                If an account exists for {email}, you&apos;ll receive a password reset link shortly.
              </p>
              <Link href="/login">
                <Button variant="secondary">Back to Sign In</Button>
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <Alert variant="error" onDismiss={clearError}>
                  {error}
                </Alert>
              )}
              <form onSubmit={handleSubmit} className="space-y-5 mt-4">
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
                <Button type="submit" loading={loading} className="w-full" size="lg">
                  Send Reset Link
                </Button>
              </form>
              <p className="text-center text-sm text-surface-400 mt-6">
                <Link href="/login" className="text-primary-400 hover:text-primary-300 font-medium">
                  Back to Sign In
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
