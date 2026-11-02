/**
 * Typed client for the Debonaire PHP API, used by both the web app and the CLI.
 *
 * Every failure becomes an ApiError carrying the API's error envelope (code,
 * message, per-field messages), or code "network_error" when the API could
 * not be reached. Callers handle one error type.
 *
 * Features: F2 submit, F3 retrieve, F7 idempotency key, F8 corrections, F9 mock identity headers.
 */

import type {
  ApiErrorBody,
  AuditEntry,
  Correction,
  Dealership,
  DealershipReturn,
  Identity,
  NewReturn,
  ReportFilter,
  ReturnsReport,
} from './types';

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the API could not be reached. */
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
    /** On a 409 duplicate, the return that already exists. */
    readonly existing?: DealershipReturn,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  identity: Identity;
  /** Injected in tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

export interface SubmitOutcome {
  data: DealershipReturn;
  /** True when the server recognised the Idempotency-Key and replayed an earlier success. */
  replayed: boolean;
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient({ baseUrl, identity, fetch: fetchImpl }: ApiClientOptions) {
  // Wrap the global so it is never called detached (browsers throw "Illegal invocation").
  const doFetch: typeof fetch = fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const root = baseUrl.replace(/\/+$/, '');

  async function request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    options: { body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {},
  ): Promise<{ body: T; response: Response }> {
    // MOCK AUTH (F9): identity travels as plain headers. Production would use a session or token.
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Debonaire-Role': identity.role,
      ...(identity.role === 'dealer' ? { 'X-Debonaire-Dealership': identity.dealershipId } : {}),
      ...options.headers,
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await doFetch(root + path, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      });
    } catch (cause) {
      // Let cancellations through untouched so callers can ignore them.
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        throw cause;
      }
      throw new ApiError(0, 'network_error', `Could not reach the Debonaire API at ${root}.`);
    }

    const body = await readJson(response);

    if (!response.ok) {
      const envelope = (body as Partial<ApiErrorBody> | null)?.error;
      throw new ApiError(
        response.status,
        envelope?.code ?? 'http_error',
        envelope?.message ?? `The API responded with HTTP ${response.status}.`,
        envelope?.fields ?? {},
        envelope?.existing,
      );
    }

    return { body: body as T, response };
  }

  return {
    async listDealerships(signal?: AbortSignal): Promise<Dealership[]> {
      return (await request<{ data: Dealership[] }>('GET', '/api/dealerships', { signal })).body.data;
    },

    async listReturns(filter: ReportFilter = {}, signal?: AbortSignal): Promise<ReturnsReport> {
      const query = new URLSearchParams();
      for (const key of ['from', 'to', 'dealershipId'] as const) {
        const value = filter[key];
        if (value) {
          query.set(key, value);
        }
      }
      const queryString = query.toString();
      const suffix = queryString === '' ? '' : `?${queryString}`;
      return (await request<ReturnsReport>('GET', `/api/returns${suffix}`, { signal })).body;
    },

    async submitReturn(input: NewReturn, idempotencyKey?: string): Promise<SubmitOutcome> {
      const { body, response } = await request<{ data: DealershipReturn }>('POST', '/api/returns', {
        body: input,
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      });
      return { data: body.data, replayed: response.headers.get('Idempotent-Replayed') === 'true' };
    },

    async correctReturn(id: number, correction: Correction): Promise<DealershipReturn> {
      return (await request<{ data: DealershipReturn }>('PUT', `/api/returns/${id}`, { body: correction })).body
        .data;
    },

    async getAudit(id: number, signal?: AbortSignal): Promise<AuditEntry[]> {
      return (await request<{ data: AuditEntry[] }>('GET', `/api/returns/${id}/audit`, { signal })).body.data;
    },
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
