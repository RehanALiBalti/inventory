'use client';

import React from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

interface DashboardData {
  shopName: string;
  shopStockCount: number;
  warehouseStockCount: number;
  todayReceived: number;
  todayTransferred: number;
  todaySold: number;
  lowStockProducts: number;
  linkedWarehouses: number;
}

export default function DashboardCharts({ data }: { data: DashboardData }) {
  // Chart Data Preparation
  const stockData = [
    { name: 'Shop Stock', value: data.shopStockCount },
    { name: 'Warehouse Stock', value: data.warehouseStockCount },
  ];
  
  const activityData = [
    { name: 'Received', count: data.todayReceived, fill: '#10b981' },
    { name: 'Transferred', count: data.todayTransferred, fill: '#3b82f6' },
    { name: 'Sold', count: data.todaySold, fill: '#8b5cf6' },
    { name: 'Low Stock', count: data.lowStockProducts, fill: '#f59e0b' },
  ];

  const COLORS = ['#6366f1', '#a855f7'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
      {/* Animated Stock Distribution */}
      <div className="bg-white border border-surface-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-surface-900 mb-4">Stock Distribution</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stockData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                animationDuration={1500}
                animationBegin={200}
                animationEasing="ease-out"
              >
                {stockData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Animated Today's Activity & Metrics */}
      <div className="bg-white border border-surface-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-surface-900 mb-4">Metrics & Activity</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={activityData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dx={-10} />
              <Tooltip 
                cursor={{ fill: '#f1f5f9' }}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar 
                dataKey="count" 
                radius={[6, 6, 0, 0]} 
                animationDuration={1500}
                animationBegin={200}
                animationEasing="ease-out"
              >
                {activityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
