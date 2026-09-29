'use client';

import React from 'react';

// =============================================================================
// Button
// =============================================================================
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-500/20 active:shadow-primary-500/10',
  secondary: 'bg-surface-100 hover:bg-surface-200 text-surface-900 border border-surface-600',
  danger: 'bg-danger-600 hover:bg-danger-500 text-white shadow-lg shadow-danger-500/20',
  ghost: 'bg-transparent hover:bg-white text-surface-700 hover:text-surface-900',
  success: 'bg-success-600 hover:bg-success-500 text-white shadow-lg shadow-success-500/20',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3 text-base rounded-xl gap-2.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center font-medium transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
        ${variantClasses[variant]} ${sizeClasses[size]} ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

// =============================================================================
// Input
// =============================================================================
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-surface-700">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              w-full bg-white border rounded-xl px-4 py-2.5 text-sm text-surface-900
              placeholder:text-surface-400 outline-none transition-all duration-200
              focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500
              disabled:opacity-50 disabled:cursor-not-allowed
              ${icon ? 'pl-10' : ''}
              ${error ? 'border-danger-500/50 focus:ring-danger-500/30 focus:border-danger-500' : 'border-surface-200'}
              ${className}
            `}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-danger-500">{error}</p>}
        {hint && !error && <p className="text-xs text-surface-400">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

// =============================================================================
// Select
// =============================================================================
interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className = '', id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-surface-700">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`
            w-full bg-white border rounded-xl px-4 py-2.5 text-sm text-surface-900
            outline-none transition-all duration-200
            focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-danger-500/50' : 'border-surface-200'}
            ${className}
          `}
          {...props}
        >
          {placeholder && (
            <option value="" className="bg-white">{placeholder}</option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled} className="bg-white">
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-danger-500">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';

// =============================================================================
// Textarea
// =============================================================================
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-medium text-surface-700">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`
            w-full bg-white border rounded-xl px-4 py-2.5 text-sm text-surface-900
            placeholder:text-surface-400 outline-none transition-all duration-200
            focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500
            disabled:opacity-50 disabled:cursor-not-allowed resize-y min-h-[80px]
            ${error ? 'border-danger-500/50' : 'border-surface-200'}
            ${className}
          `}
          {...props}
        />
        {error && <p className="text-xs text-danger-500">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

// =============================================================================
// Card
// =============================================================================
interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({ children, className = '', hover = false, padding = 'md', onClick }: CardProps) {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      className={`
        ${hover ? 'glass-card-hover' : 'glass-card'}
        ${paddingClasses[padding]}
        ${onClick ? 'cursor-pointer w-full text-left' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </Component>
  );
}

// =============================================================================
// Badge
// =============================================================================
type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({ children, variant = 'neutral', dot = false }: BadgeProps) {
  return (
    <span className={`badge-${variant}`}>
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
          variant === 'success' ? 'bg-success-500' :
          variant === 'warning' ? 'bg-warning-500' :
          variant === 'danger' ? 'bg-danger-500' :
          variant === 'info' ? 'bg-primary-400' :
          'bg-surface-400'
        }`} />
      )}
      {children}
    </span>
  );
}

// =============================================================================
// Modal
// =============================================================================
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export function Modal({ open, onClose, title, children, maxWidth = 'md' }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-surface-50/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={`
          relative w-full ${maxWidthClasses[maxWidth]} glass-card p-6 animate-slide-up
          shadow-2xl shadow-surface-200/50
        `}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-surface-900">{title}</h3>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-900 transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// LoadingSpinner
// =============================================================================
interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeMap = { sm: 'h-5 w-5', md: 'h-8 w-8', lg: 'h-12 w-12' };
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <svg className={`animate-spin text-primary-500 ${sizeMap[size]}`} viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}

// =============================================================================
// FullPageLoading
// =============================================================================
export function FullPageLoading({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <LoadingSpinner size="lg" />
      <p className="text-surface-400 text-sm animate-pulse-soft">{message}</p>
    </div>
  );
}

// =============================================================================
// EmptyState
// =============================================================================
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && <div className="text-surface-400 mb-4">{icon}</div>}
      <h3 className="text-lg font-medium text-surface-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-surface-400 max-w-sm mb-4">{description}</p>}
      {action}
    </div>
  );
}

// =============================================================================
// Alert
// =============================================================================
type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const alertClasses: Record<AlertVariant, string> = {
  info: 'bg-primary-500/10 border-primary-500/20 text-primary-300',
  success: 'bg-success-500/10 border-success-500/20 text-success-500',
  warning: 'bg-warning-500/10 border-warning-500/20 text-warning-500',
  error: 'bg-danger-500/10 border-danger-500/20 text-danger-500',
};

export function Alert({ variant = 'info', title, children, onDismiss, className = '' }: AlertProps) {
  return (
    <div className={`rounded-xl border p-4 ${alertClasses[variant]} animate-fade-in ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {title && <p className="font-medium mb-1">{title}</p>}
          <div className="text-sm opacity-90">{children}</div>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Confirm Dialog
// =============================================================================
interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'primary' | 'danger';
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'primary',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-surface-400 mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

// =============================================================================
// Search Input
// =============================================================================
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search...', className = '' }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-surface-200 rounded-xl pl-10 pr-4 py-2.5 text-sm
          text-surface-900 placeholder:text-surface-400 outline-none transition-all duration-200
          focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Stat Card (Dashboard)
// =============================================================================
interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  sublabel?: string;
  className?: string;
}

export function StatCard({ label, value, icon, sublabel, className = '' }: StatCardProps) {
  return (
    <Card className={`${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-bold text-surface-900">{value}</p>
          {sublabel && <p className="text-xs text-surface-400 mt-1">{sublabel}</p>}
        </div>
        {icon && (
          <div className="p-2.5 rounded-xl bg-primary-500/10 text-primary-400">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

// =============================================================================
// Toggle / Checkbox
// =============================================================================
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <label className={`inline-flex items-center gap-2.5 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200
          ${checked ? 'bg-primary-600' : 'bg-surface-200'}
        `}
      >
        <span
          className={`
            inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200
            ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}
          `}
        />
      </button>
      {label && <span className="text-sm text-surface-700">{label}</span>}
    </label>
  );
}

// =============================================================================
// Table
// =============================================================================
interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyMessage = 'No data available',
  onRowClick,
}: TableProps<T>) {
  if (loading) {
    return <LoadingSpinner className="py-12" />;
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title={emptyMessage}
        icon={
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-surface-200">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3 ${col.headerClassName || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-200">
          {data.map((item) => (
            <tr
              key={keyExtractor(item)}
              className={`
                transition-colors duration-150
                ${onRowClick ? 'hover:bg-surface-50 cursor-pointer' : ''}
              `}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((col) => (
                <td key={col.key} className={`px-4 py-3 text-sm ${col.className || ''}`}>
                  {col.render
                    ? col.render(item)
                    : String((item as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Pagination
// =============================================================================
interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        Previous
      </Button>
      <span className="text-sm text-surface-400">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        Next
      </Button>
    </div>
  );
}
