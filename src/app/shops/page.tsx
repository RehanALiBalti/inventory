'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { FullPageLoading, Button, Alert } from '@/components/ui';
import { Icons } from '@/components/layout/Sidebar';

interface ShopData {
  id: string;
  name: string;
  linkedWarehouseIds?: string[];
}

export default function ShopsPage() {
  const { userRecord, firebaseUser, loading: authLoading, signOut } = useAuth();
  const [shops, setShops] = useState<ShopData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredShop, setHoveredShop] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) { router.replace('/login'); return; }
    if (!userRecord) return;
    if (userRecord.status !== 'approved') { router.replace('/account-status'); return; }

    loadShops();
  }, [authLoading, firebaseUser, userRecord, router]);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadShops = async () => {
    setLoading(true);
    const res = await apiFetch<ShopData[]>('/api/shops');
    if (res.success && res.data) {
      setShops(res.data);

      // Staff with one shop → auto-navigate
      if (userRecord?.role === 'staff' && res.data.length === 1) {
        router.replace(`/shop/${res.data[0].id}/dashboard`);
        return;
      }
    } else {
      setError(res.error || 'Failed to load shops');
    }
    setLoading(false);
  };

  if (authLoading || loading) return <FullPageLoading message="Loading shops..." />;

  const isAdmin = userRecord?.role === 'admin';

  // Staff with no shops
  if (!isAdmin && shops.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-surface-50">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary-500/10 mb-6">
            {Icons.shop}
          </div>
          <h2 className="text-2xl font-bold text-surface-900 mb-3">No Shop Access</h2>
          <p className="text-surface-400 mb-8">
            Please contact an administrator to get shop access assigned.
          </p>
          <Button variant="secondary" onClick={() => signOut()}>Sign Out</Button>
        </div>
      </div>
    );
  }

  const getGreeting = () => {
    const h = currentTime.getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getFirstName = () => {
    const full = userRecord?.fullName || '';
    return full.split(' ')[0] || 'User';
  };

  const shopThemes = [
    {
      gradient: 'from-indigo-600 via-violet-600 to-purple-700',
      iconBg: 'bg-white/20',
      glow: 'bg-indigo-500/30',
      ring: 'ring-indigo-400/30',
      accentText: 'text-indigo-200',
      icon: (
        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      gradient: 'from-amber-500 via-orange-500 to-red-500',
      iconBg: 'bg-white/20',
      glow: 'bg-amber-500/30',
      ring: 'ring-amber-400/30',
      accentText: 'text-amber-200',
      icon: (
        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      gradient: 'from-emerald-500 via-teal-600 to-cyan-600',
      iconBg: 'bg-white/20',
      glow: 'bg-emerald-500/30',
      ring: 'ring-emerald-400/30',
      accentText: 'text-emerald-200',
      icon: (
        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      gradient: 'from-rose-500 via-pink-600 to-fuchsia-600',
      iconBg: 'bg-white/20',
      glow: 'bg-rose-500/30',
      ring: 'ring-rose-400/30',
      accentText: 'text-rose-200',
      icon: (
        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      ),
    },
    {
      gradient: 'from-sky-500 via-blue-600 to-indigo-600',
      iconBg: 'bg-white/20',
      glow: 'bg-sky-500/30',
      ring: 'ring-sky-400/30',
      accentText: 'text-sky-200',
      icon: (
        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
  ];

  const adminTools = [
    {
      href: '/admin/staff',
      icon: Icons.users,
      label: 'Staff Management',
      description: 'Manage team members & permissions',
      color: 'from-violet-500/10 to-purple-500/10',
      iconColor: 'text-violet-500',
      borderColor: 'border-violet-200/60 hover:border-violet-300',
    },
    {
      href: '/admin/activity',
      icon: Icons.activity,
      label: 'Activity Logs',
      description: 'View audit trail & system events',
      color: 'from-blue-500/10 to-cyan-500/10',
      iconColor: 'text-blue-500',
      borderColor: 'border-blue-200/60 hover:border-blue-300',
    },
  ];

  return (
    <div className="min-h-screen bg-surface-50 relative overflow-hidden">
      {/* Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-gradient-to-br from-primary-500/8 to-violet-500/8 rounded-full blur-3xl animate-pulse-soft" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-gradient-to-br from-amber-500/6 to-rose-500/6 rounded-full blur-3xl" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-emerald-500/4 to-cyan-500/4 rounded-full blur-3xl" />
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Top Navigation Bar */}
        <nav className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            {/* Logo / Brand */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/25">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-surface-900 tracking-tight">Inventory</h2>
              <p className="text-[10px] text-surface-400 font-medium uppercase tracking-widest">Management System</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* User Avatar & Name */}
            <div className="hidden sm:flex items-center gap-3 mr-2">
              <div className="text-right">
                <p className="text-sm font-semibold text-surface-800">{userRecord?.fullName}</p>
                <p className="text-[11px] text-surface-400 capitalize">{userRecord?.role}</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-sm font-bold shadow-md shadow-primary-500/20">
                {getFirstName().charAt(0).toUpperCase()}
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="p-2 rounded-xl text-surface-400 hover:text-surface-700 hover:bg-white/80 transition-all duration-200 border border-transparent hover:border-surface-200"
              title="Sign Out"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="mb-10">
          <div className="flex items-end justify-between mb-1">
            <div>
              <p className="text-sm font-medium text-primary-500 mb-1">{getGreeting()}</p>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-surface-900 tracking-tight">
                {isAdmin ? 'Command Center' : `Welcome, ${getFirstName()}`}
              </h1>
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-xs text-surface-400">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <p className="text-lg font-semibold text-surface-700 tabular-nums">
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <p className="text-surface-400 text-sm max-w-lg">
            {isAdmin
              ? 'Select a shop to manage inventory, view reports, and track operations.'
              : 'Select a shop below to view and manage inventory.'}
          </p>
        </div>

        {error && (
          <Alert variant="error" onDismiss={() => setError(null)} className="mb-6">
            {error}
          </Alert>
        )}

        {/* Shop Cards Grid */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-5 rounded-full bg-gradient-to-b from-primary-500 to-primary-600" />
            <h2 className="text-base font-semibold text-surface-700 uppercase tracking-wide">
              Your Shops
            </h2>
            <span className="ml-auto text-xs text-surface-400 bg-surface-100 px-2.5 py-1 rounded-full font-medium">
              {shops.length} {shops.length === 1 ? 'shop' : 'shops'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {shops.map((shop, idx) => {
              const theme = shopThemes[idx % shopThemes.length];
              const isHovered = hoveredShop === shop.id;

              return (
                <button
                  key={shop.id}
                  onClick={() => router.push(`/shop/${shop.id}/dashboard`)}
                  onMouseEnter={() => setHoveredShop(shop.id)}
                  onMouseLeave={() => setHoveredShop(null)}
                  className={`
                    group relative overflow-hidden rounded-2xl p-6 text-left w-full
                    bg-gradient-to-br ${theme.gradient}
                    shadow-lg hover:shadow-2xl
                    transform transition-all duration-500 ease-out
                    hover:-translate-y-1 hover:scale-[1.02]
                    focus:outline-none focus:ring-4 ${theme.ring}
                  `}
                >
                  {/* Decorative elements */}
                  <div className={`absolute -top-12 -right-12 w-40 h-40 ${theme.glow} rounded-full blur-2xl transition-all duration-500 ${isHovered ? 'opacity-60 scale-125' : 'opacity-30'}`} />
                  <div className={`absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full transition-all duration-500 ${isHovered ? 'scale-150' : 'scale-100'}`} />

                  {/* Floating dots pattern */}
                  <div className="absolute top-4 right-4 opacity-20">
                    <div className="grid grid-cols-3 gap-1.5">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="w-1 h-1 rounded-full bg-white" />
                      ))}
                    </div>
                  </div>

                  <div className="relative z-10 flex items-start gap-4">
                    {/* Icon */}
                    <div className={`${theme.iconBg} backdrop-blur-sm rounded-xl p-3 transition-transform duration-500 ${isHovered ? 'scale-110 rotate-3' : ''}`}>
                      {theme.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-white mb-1 truncate">
                        {shop.name}
                      </h3>
                      <p className={`text-sm ${theme.accentText} font-medium`}>
                        {isAdmin ? 'Manage Operations' : 'View Dashboard'}
                      </p>

                      {/* Stats bar */}
                      <div className="flex items-center gap-3 mt-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-xs text-white/70 font-medium">Active</span>
                        </div>
                        {shop.linkedWarehouseIds && shop.linkedWarehouseIds.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                            </svg>
                            <span className="text-xs text-white/50 font-medium">
                              {shop.linkedWarehouseIds.length} Warehouse{shop.linkedWarehouseIds.length > 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className={`self-center transition-all duration-300 ${isHovered ? 'translate-x-1 opacity-100' : 'opacity-60'}`}>
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Admin Quick Access */}
        {isAdmin && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-1 h-5 rounded-full bg-gradient-to-b from-surface-400 to-surface-500" />
              <h2 className="text-base font-semibold text-surface-700 uppercase tracking-wide">
                Admin Tools
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {adminTools.map((tool) => (
                <button
                  key={tool.href}
                  onClick={() => router.push(tool.href)}
                  className={`
                    group relative overflow-hidden rounded-2xl p-5 text-left w-full
                    bg-gradient-to-br ${tool.color} backdrop-blur-sm
                    border ${tool.borderColor}
                    transition-all duration-300 ease-out
                    hover:shadow-lg hover:-translate-y-0.5
                  `}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-xl bg-white/70 shadow-sm ${tool.iconColor} transition-transform duration-300 group-hover:scale-110`}>
                      {tool.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-surface-800 group-hover:text-surface-900 transition-colors">
                        {tool.label}
                      </h3>
                      <p className="text-xs text-surface-400 mt-0.5 truncate">
                        {tool.description}
                      </p>
                    </div>
                    <svg className="w-5 h-5 text-surface-300 group-hover:text-surface-500 transition-all duration-300 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-6 pb-4 border-t border-surface-200/50">
          <p className="text-xs text-surface-300">
            Inventory Management System • {currentTime.getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
