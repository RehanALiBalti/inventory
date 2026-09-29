'use client';

import React from 'react';
import { AppSidebar } from './Sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
  shopId?: string;
  shopName?: string;
}

export function AppLayout({ children, shopId, shopName }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-surface-50">
      <AppSidebar shopId={shopId} shopName={shopName} />
      <main className="lg:pl-64 pt-14 lg:pt-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

// Page header component
interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 lg:mb-8">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-surface-900">{title}</h1>
        {description && (
          <p className="text-sm text-surface-400 mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3 flex-shrink-0">{actions}</div>}
    </div>
  );
}
