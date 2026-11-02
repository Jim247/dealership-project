/**
 * Covers the typed API client: identity headers (F9), the idempotency key
 * (F7), query building (F3) and error-envelope handling.
 */
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../src/api-client';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

const report = {
  data: [],
  totals: { returnCount: 0, totalEnquiries: 0, totalSales: 0, conversionRate: null },
  filter: { from: null, to: null, dealershipId: null },
};

describe('createApiClient', () => {
  it('sends manager identity headers and only the filters that are set', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, report));
    const client = createApiClient({ baseUrl: 'http://api.test/', identity: { role: 'manager' }, fetch });

    await client.listReturns({ from: '2026-06', to: '', dealershipId: null });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/returns?from=2026-06');
    expect(init.headers).toMatchObject({ 'X-Debonaire-Role': 'manager' });
    expect(init.headers).not.toHaveProperty('X-Debonaire-Dealership');
  });

  it('sends the dealership header for dealers', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, report));
    const client = createApiClient({
      baseUrl: 'http://api.test',
      identity: { role: 'dealer', dealershipId: 'NGM' },
      fetch,
    });

    await client.listReturns();

    expect(fetch.mock.calls[0]![1].headers).toMatchObject({
      'X-Debonaire-Role': 'dealer',
      'X-Debonaire-Dealership': 'NGM',
    });
  });

  it('posts a return as JSON with the idempotency key and reports replays', async () => {
    const created = { id: 7, dealershipId: 'RVA' };
    const fetch = vi.fn().mockResolvedValue(jsonResponse(201, { data: created }, { 'Idempotent-Replayed': 'true' }));
    const client = createApiClient({ baseUrl: 'http://api.test', identity: { role: 'manager' }, fetch });

    const outcome = await client.submitReturn(
      { dealershipId: 'RVA', month: '2026-10', enquiries: 10, sales: 2 },
      'key-12345678',
    );

    const [, init] = fetch.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', 'Idempotency-Key': 'key-12345678' });
    expect(JSON.parse(init.body)).toEqual({ dealershipId: 'RVA', month: '2026-10', enquiries: 10, sales: 2 });
    expect(outcome).toEqual({ data: created, replayed: true });
  });

  it('turns the API error envelope into an ApiError with field messages', async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse(422, {
        error: { code: 'validation_failed', message: 'Fix the fields.', fields: { sales: 'Too many sales.' } },
      }),
    );
    const client = createApiClient({ baseUrl: 'http://api.test', identity: { role: 'manager' }, fetch });

    const error = await client.listReturns().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: 'validation_failed', fields: { sales: 'Too many sales.' } });
  });

  it('turns an unreachable API into a network ApiError', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const client = createApiClient({ baseUrl: 'http://api.test', identity: { role: 'manager' }, fetch });

    const error = (await client.listDealerships().catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.isNetworkError).toBe(true);
    expect(error.message).toContain('http://api.test');
  });

  it('copes with a non-JSON error body', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('<h1>Bad gateway</h1>', { status: 502 }));
    const client = createApiClient({ baseUrl: 'http://api.test', identity: { role: 'manager' }, fetch });

    await expect(client.listReturns()).rejects.toMatchObject({ status: 502, code: 'http_error' });
  });
});
