'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  badge?: string | number;
}

interface SidebarProps {
  shopId?: string;
  shopName?: string;
}

// SVG Icons as components
const Icons = {
  dashboard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  inventory: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  warehouse: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
    </svg>
  ),
  transfer: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  sale: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  ),
  products: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  users: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  activity: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  reports: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  import: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  ),
  received: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  ),
  lowStock: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  shop: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  logout: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  menu: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  close: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  switchShop: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
};

export { Icons };

export function AppSidebar({ shopId, shopName }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { userRecord, signOut } = useAuth();
  const isAdmin = userRecord?.role === 'admin';

  const shopPrefix = shopId ? `/shop/${shopId}` : '';

  const dashboardItem: NavItem = {
    label: 'Dashboard',
    href: `${shopPrefix}/dashboard`,
    icon: Icons.dashboard,
  };

  const warehouseItems: NavItem[] = [
    { label: 'Warehouse Stock', href: `${shopPrefix}/warehouse-stock`, icon: Icons.warehouse },
    { label: 'Transfers', href: `${shopPrefix}/transfers`, icon: Icons.transfer },
    { label: 'Warehouses', href: `${shopPrefix}/warehouses`, icon: Icons.warehouse, adminOnly: true },
  ];

  const shopItems: NavItem[] = [
    { label: 'Shop Stock', href: `${shopPrefix}/stock`, icon: Icons.inventory },
    { label: 'Products', href: `${shopPrefix}/products`, icon: Icons.products },
    { label: 'Sales', href: `${shopPrefix}/sales`, icon: Icons.sale },
  ];

  const historyItems: NavItem[] = [
    { label: 'History', href: `${shopPrefix}/history`, icon: Icons.activity },
  ];

  const globalAdminItems: NavItem[] = [
    { label: 'System Dashboard', href: '/shops', icon: Icons.dashboard, adminOnly: true },
    { label: 'Global Staff', href: '/admin/staff', icon: Icons.users, adminOnly: true },
    { label: 'Global Activity', href: '/admin/activity', icon: Icons.activity, adminOnly: true },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const renderNavLink = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      onClick={() => setMobileOpen(false)}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
        ${isActive(item.href)
          ? 'bg-primary-600/20 text-primary-400 shadow-sm'
          : 'text-surface-400 hover:text-surface-900 hover:bg-white'
        }
      `}
    >
      <span className={isActive(item.href) ? 'text-primary-400' : ''}>{item.icon}</span>
      <span className="flex-1">{item.label}</span>
      {item.badge && (
        <span className="bg-danger-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
          {item.badge}
        </span>
      )}
    </Link>
  );

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className="px-4 py-5 border-b border-surface-200">
        <Link href="/shops" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/20">
            <span className="text-white font-bold text-sm">IM</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-surface-900">Inventory</h1>
            <p className="text-[10px] text-surface-400">Management System</p>
          </div>
        </Link>
      </div>

      {/* Shop indicator */}
      {shopName && (
        <div className="px-4 py-3 border-b border-surface-200">
          <Link
            href="/shops"
            className="flex items-center gap-2 text-xs text-surface-400 hover:text-primary-400 transition-colors group"
          >
            {Icons.switchShop}
            <span className="font-medium text-surface-800 group-hover:text-primary-400">
              {shopName}
            </span>
          </Link>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {shopId && (
          <>
            {renderNavLink(dashboardItem)}

            {/* Warehouse Group */}
            <div className="pt-4 pb-1">
              <p className="px-3 text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                Warehouse
              </p>
            </div>
            {warehouseItems.filter(item => !item.adminOnly || isAdmin).map(renderNavLink)}

            {/* Shop Group */}
            <div className="pt-4 pb-1">
              <p className="px-3 text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                Shop
              </p>
            </div>
            {shopItems.filter(item => !item.adminOnly || isAdmin).map(renderNavLink)}

            {/* History Group */}
            <div className="pt-4 pb-1">
              <p className="px-3 text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                History
              </p>
            </div>
            {historyItems.map(renderNavLink)}
          </>
        )}

        {isAdmin && (
          <>
            <div className="pt-4 pb-1 border-t border-surface-200/40 mt-3">
              <p className="px-3 text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                Global Admin
              </p>
            </div>
            {globalAdminItems.map(renderNavLink)}
          </>
        )}
      </nav>

      {/* User / Logout */}
      <div className="px-3 py-4 border-t border-surface-200">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">
              {userRecord?.fullName?.charAt(0)?.toUpperCase() || '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-surface-800 truncate">
              {userRecord?.fullName || 'User'}
            </p>
            <p className="text-[10px] text-surface-400 truncate capitalize">
              {userRecord?.role}
            </p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-surface-400 hover:text-danger-400 hover:bg-danger-500/10 transition-all duration-200 mt-1"
        >
          {Icons.logout}
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-surface-100/90 backdrop-blur-xl border-b border-surface-200 flex items-center px-4">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-lg hover:bg-white text-surface-700"
          aria-label="Open menu"
        >
          {Icons.menu}
        </button>
        <div className="flex-1 flex items-center justify-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <span className="text-white font-bold text-xs">IM</span>
          </div>
          {shopName && (
            <span className="text-sm font-semibold text-surface-800">{shopName}</span>
          )}
        </div>
        <div className="w-8" /> {/* Spacer for symmetry */}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-surface-50/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-surface-100 shadow-2xl animate-slide-in-right">
            <div className="absolute top-3 right-3">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white text-surface-400"
                aria-label="Close menu"
              >
                {Icons.close}
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-surface-100/95 backdrop-blur-xl border-r border-surface-200 z-30">
        {sidebarContent}
      </aside>
    </>
  );
}
