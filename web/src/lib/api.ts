/**
 * Browser-side access to the PHP API.
 *
 * The page calls the PHP API directly, which is what the spec asks for
 * ("a simple form that submits to the PHP API"). CORS on the API allows this origin.
 */

import { ApiError, createApiClient, type ApiClient, type Identity } from '@debonaire/shared';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

export function apiClientFor(identity: Identity): ApiClient {
  return createApiClient({ baseUrl: API_BASE_URL, identity });
}

/** Normalises anything thrown by the client into an ApiError for display. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError(0, 'unexpected_error', error instanceof Error ? error.message : 'Something went wrong.');
}

/**
 * A fresh key per submission attempt (F7). The form reuses it when retrying
 * the same data, so a retry after a lost response cannot create a duplicate.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
