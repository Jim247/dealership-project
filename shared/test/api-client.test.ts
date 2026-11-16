/**
 * Covers the typed API client: identity headers (F9), the idempotency key
 * (F7), query building (F3), error-envelope handling and the public demo's
 * access code (F15).
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

describe('createApiClient access code (F15)', () => {
  it('sends the access code as a Bearer token when one is given', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, report));
    const client = createApiClient({ baseUrl: 'http://api.test', identity: { role: 'manager' }, accessCode: 'abc123', fetch });

    await client.listReturns();

    expect(fetch.mock.calls[0]![1].headers).toMatchObject({ Authorization: 'Bearer abc123', 'X-Debonaire-Role': 'manager' });
  });

  it('sends no Authorization header without a code', async () => {
    // A fresh Response per call: a body can only be read once.
    const fetch = vi.fn().mockImplementation(async () => jsonResponse(200, report));
    for (const accessCode of [undefined, null, '']) {
      const client = createApiClient({ baseUrl: 'http://api.test', identity: { role: 'manager' }, accessCode, fetch });
      await client.listReturns();
    }

    for (const [, init] of fetch.mock.calls) {
      expect(init.headers).not.toHaveProperty('Authorization');
    }
  });

  it.each(['access_code_required', 'invalid_access_code'])('reports a %s refusal before throwing', async (code) => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(401, { error: { code, message: 'No.' } }));
    const onAccessCodeRejected = vi.fn();
    const client = createApiClient({ baseUrl: 'http://api.test', identity: { role: 'manager' }, onAccessCodeRejected, fetch });

    const error = (await client.listReturns().catch((e: unknown) => e)) as ApiError;

    expect(error.isAccessCodeError).toBe(true);
    expect(onAccessCodeRejected).toHaveBeenCalledWith(error);
  });

  it('does not treat other 401s, such as a missing identity, as an access code problem', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: 'missing_identity', message: 'Who?' } }));
    const onAccessCodeRejected = vi.fn();
    const client = createApiClient({ baseUrl: 'http://api.test', identity: { role: 'manager' }, onAccessCodeRejected, fetch });

    const error = (await client.listReturns().catch((e: unknown) => e)) as ApiError;

    expect(error.isAccessCodeError).toBe(false);
    expect(onAccessCodeRejected).not.toHaveBeenCalled();
  });
});
