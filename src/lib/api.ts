import { auth } from '@/lib/firebase/client';
import { ApiResponse } from '@/types';

/**
 * Authenticated fetch wrapper. Automatically attaches the Firebase ID token.
 */
export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const user = auth.currentUser;
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const token = await user.getIdToken();
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      ...(options.headers as Record<string, string> || {}),
    };

    // Add Content-Type for non-FormData requests
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `Request failed with status ${response.status}`,
        details: data.details,
      };
    }

    return data;
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      return { success: false, error: 'Network error. Please check your connection.' };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}
