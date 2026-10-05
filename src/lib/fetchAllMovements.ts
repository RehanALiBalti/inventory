import { apiFetch } from '@/lib/api';

/**
 * Walk every page of /api/stock/movements until the cursor runs out.
 * `pathAndQuery` is a relative URL, for example `/api/stock/movements?shopId=abc&type=sale`.
 */
export async function fetchAllMovements<T>(pathAndQuery: string): Promise<{ items: T[]; error?: string }> {
  const items: T[] = [];
  let cursor: string | null = null;
  const [path, rawQuery = ''] = pathAndQuery.split('?');

  for (let page = 0; page < 200; page++) {
    const params = new URLSearchParams(rawQuery);
    params.set('limit', '100');
    if (cursor) params.set('cursor', cursor);
    else params.delete('cursor');

    const res = await apiFetch<T[]>(`${path}?${params.toString()}`);
    if (!res.success || !res.data) {
      return { items: [], error: res.error || 'Failed to load records' };
    }

    items.push(...res.data);
    if (!res.nextCursor || res.data.length === 0) break;
    if (res.nextCursor === cursor) break;
    cursor = res.nextCursor;
  }

  return { items };
}
