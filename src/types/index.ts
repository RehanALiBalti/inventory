// =============================================================================
// Inventory Management System — Core Types
// =============================================================================
import { Timestamp } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// User / Auth
// ---------------------------------------------------------------------------
export type UserRole = 'admin' | 'staff';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'disabled';

export interface ShopPermissions {
  view: boolean;
  transfer: boolean;
  recordSale: boolean;
}

export interface UserRecord {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  /** Map of shopId → permissions */
  shopPermissions: Record<string, ShopPermissions>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------
export interface Shop {
  id: string;
  name: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Warehouse
// ---------------------------------------------------------------------------
export interface Warehouse {
  id: string;
  name: string;
  /** The shop this warehouse belongs to */
  shopId: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------
export interface Product {
  id: string;
  sku: string;
  name: string;
  /** The shop this product belongs to */
  shopId: string;
  /** e.g. 'pcs', 'kg', 'litre' */
  unit: string;
  active: boolean;
  /** Null means no low-stock warning */
  lowStockThreshold: number | null;
  /** Whether fractional quantities are allowed */
  fractionalUnits: boolean;
  /** For import tracking */
  importRef?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Stock Balance
// Document ID = `${locationId}_${productId}` for deterministic lookups
// ---------------------------------------------------------------------------
export type LocationType = 'warehouse' | 'shop';

export interface StockBalance {
  id: string;
  productId: string;
  productName: string; // name snapshot
  locationId: string;
  locationName: string; // name snapshot
  /** The shop this balance belongs to */
  shopId: string;
  locationType: LocationType;
  quantity: number;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Stock Movement (authoritative ledger)
// ---------------------------------------------------------------------------
export type MovementType =
  | 'stock_received'
  | 'warehouse_to_shop_transfer'
  | 'warehouse_to_warehouse_transfer'
  | 'sale'
  | 'reversal'
  | 'adjustment'
  | 'opening_balance';

export interface MovementLineItem {
  productId: string;
  productName: string; // snapshot
  productSku: string; // snapshot
  quantity: number;
  /** Balance at source before this movement */
  sourceBalanceBefore?: number;
  /** Balance at source after this movement */
  sourceBalanceAfter?: number;
  /** Balance at destination before this movement */
  destBalanceBefore?: number;
  /** Balance at destination after this movement */
  destBalanceAfter?: number;
}

export interface StockMovement {
  id: string;
  /** Client-generated idempotency key */
  requestKey: string;
  type: MovementType;
  lineItems: MovementLineItem[];
  /** Source location (warehouse/shop) */
  sourceLocationId?: string;
  sourceLocationName?: string;
  sourceLocationType?: LocationType;
  /** Destination location (warehouse/shop) */
  destLocationId?: string;
  destLocationName?: string;
  destLocationType?: LocationType;
  /** The shop this movement belongs to */
  shopId: string;
  /** Actor info — derived from auth token, not user input */
  actorUid: string;
  actorName: string;
  /** Server-generated timestamp when recorded */
  recordedAt: Timestamp;
  /** Business occurrence date/time */
  occurredAt: Timestamp;
  notes?: string;
  reference?: string;
  /** For reversals: ID of the original movement being reversed */
  originalMovementId?: string;
  /** Import job reference */
  importJobId?: string;
  /** Whether this movement has been reversed */
  reversed: boolean;
  reversalMovementId?: string;
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------
export type AuditAction =
  | 'stock_received'
  | 'transfer'
  | 'sale'
  | 'reversal'
  | 'adjustment'
  | 'product_created'
  | 'product_updated'
  | 'product_imported'
  | 'user_approved'
  | 'user_rejected'
  | 'user_disabled'
  | 'user_enabled'
  | 'permissions_updated'
  | 'warehouse_created'
  | 'warehouse_updated'
  | 'shop_created'
  | 'shop_updated'
  | 'shop_link_changed'
  | 'opening_balance';

export interface AuditLog {
  id: string;
  action: AuditAction;
  actorUid: string;
  actorName: string;
  /** Target entity references */
  targetType?: string;
  targetId?: string;
  targetName?: string;
  /** Related movement ID */
  movementId?: string;
  /** Shop scope if applicable */
  shopId?: string;
  shopName?: string;
  /** Before/after values for admin changes */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  notes?: string;
  timestamp: Timestamp;
}

// ---------------------------------------------------------------------------
// Import Job
// ---------------------------------------------------------------------------
export type ImportStatus = 'pending' | 'preview' | 'committed' | 'failed' | 'partial';

export interface ImportRow {
  rowIndex: number;
  rawName: string;
  trimmedName: string;
  status: 'new' | 'duplicate' | 'skipped' | 'error' | 'committed';
  productId?: string;
  generatedSku?: string;
  error?: string;
}

export interface ImportJob {
  id: string;
  /** The shop this import belongs to */
  shopId: string;
  fileName: string;
  fileHash: string;
  totalRows: number;
  processedRows: number;
  committedRows: number;
  skippedRows: number;
  errorRows: number;
  rows: ImportRow[];
  status: ImportStatus;
  actorUid: string;
  actorName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export interface AppSettings {
  businessTimezone: string;
  defaultUnit: string;
  maxTransactionLineItems: number;
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string[];
  nextCursor?: string | null;
}

// ---------------------------------------------------------------------------
// Dashboard Types
// ---------------------------------------------------------------------------
export interface DashboardMetrics {
  shopStockCount: number;
  warehouseStockCount: number;
  todayReceived: number;
  todayTransferred: number;
  todaySold: number;
  lowStockProducts: number;
}
