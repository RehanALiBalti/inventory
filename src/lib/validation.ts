// Server-side input validation utilities

export interface ValidationError {
  field: string;
  message: string;
}

export class ValidationException extends Error {
  errors: ValidationError[];
  constructor(errors: ValidationError[]) {
    super('Validation failed');
    this.errors = errors;
  }
}

export function validateRequired(value: unknown, field: string): string {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    throw new ValidationException([{ field, message: `${field} is required` }]);
  }
  return typeof value === 'string' ? value.trim() : String(value);
}

export function validatePositiveNumber(value: unknown, field: string): number {
  const num = Number(value);
  if (isNaN(num) || num <= 0) {
    throw new ValidationException([{ field, message: `${field} must be a positive number` }]);
  }
  return num;
}

export function validatePositiveInteger(value: unknown, field: string): number {
  const num = Number(value);
  if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
    throw new ValidationException([{ field, message: `${field} must be a positive whole number` }]);
  }
  return num;
}

export function validateNonNegativeNumber(value: unknown, field: string): number {
  const num = Number(value);
  if (isNaN(num) || num < 0) {
    throw new ValidationException([{ field, message: `${field} must be zero or positive` }]);
  }
  return num;
}

export function validateArray<T>(value: unknown, field: string, minLength = 1): T[] {
  if (!Array.isArray(value) || value.length < minLength) {
    throw new ValidationException([{
      field,
      message: `${field} must be an array with at least ${minLength} item(s)`,
    }]);
  }
  return value as T[];
}

export function validateString(value: unknown, field: string, maxLength = 500): string {
  const str = validateRequired(value, field);
  if (str.length > maxLength) {
    throw new ValidationException([{
      field,
      message: `${field} must be ${maxLength} characters or fewer`,
    }]);
  }
  return str;
}

export function validateEnum<T extends string>(
  value: unknown,
  field: string,
  validValues: readonly T[]
): T {
  const str = validateRequired(value, field);
  if (!validValues.includes(str as T)) {
    throw new ValidationException([{
      field,
      message: `${field} must be one of: ${validValues.join(', ')}`,
    }]);
  }
  return str as T;
}

export interface LineItemInput {
  productId: string;
  quantity: number;
}

export function validateLineItems(
  items: unknown,
  maxItems = 50,
  allowFractional = false
): LineItemInput[] {
  const arr = validateArray<Record<string, unknown>>(items, 'lineItems');
  
  if (arr.length > maxItems) {
    throw new ValidationException([{
      field: 'lineItems',
      message: `Maximum ${maxItems} line items per transaction`,
    }]);
  }

  const errors: ValidationError[] = [];
  const seen = new Set<string>();
  const validated: LineItemInput[] = [];

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const prefix = `lineItems[${i}]`;
    
    if (!item.productId || typeof item.productId !== 'string') {
      errors.push({ field: `${prefix}.productId`, message: 'Product ID is required' });
      continue;
    }

    // Reject duplicate product lines
    if (seen.has(item.productId)) {
      errors.push({ field: `${prefix}.productId`, message: 'Duplicate product in line items' });
      continue;
    }
    seen.add(item.productId);

    const qty = Number(item.quantity);
    if (isNaN(qty) || qty <= 0) {
      errors.push({ field: `${prefix}.quantity`, message: 'Quantity must be positive' });
      continue;
    }
    if (!allowFractional && !Number.isInteger(qty)) {
      errors.push({ field: `${prefix}.quantity`, message: 'Fractional quantities not allowed' });
      continue;
    }

    validated.push({ productId: item.productId, quantity: qty });
  }

  if (errors.length > 0) {
    throw new ValidationException(errors);
  }

  return validated;
}

/**
 * Parse a date string into a Date, or throw.
 */
export function validateDate(value: unknown, field: string): Date {
  if (!value) {
    throw new ValidationException([{ field, message: `${field} is required` }]);
  }
  const d = new Date(String(value));
  if (isNaN(d.getTime())) {
    throw new ValidationException([{ field, message: `${field} is not a valid date` }]);
  }
  return d;
}

/**
 * Helper to return validation error as API response.
 */
export function validationErrorResponse(e: ValidationException): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Validation failed',
      details: e.errors.map(err => `${err.field}: ${err.message}`),
    }),
    { status: 400, headers: { 'Content-Type': 'application/json' } }
  );
}
