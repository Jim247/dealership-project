import { vi, type Mock } from 'vitest';
import type { ApiClient, Dealership, DealershipReturn, ReturnsReport } from '@debonaire/shared';

export type MockClient = { [K in keyof ApiClient]: Mock };

/** An ApiClient whose every method is a vi.fn(), so tests choose each response. */
export function mockClient(): MockClient & ApiClient {
  return {
    listDealerships: vi.fn(),
    listReturns: vi.fn(),
    submitReturn: vi.fn(),
    correctReturn: vi.fn(),
    getAudit: vi.fn(),
  } as MockClient & ApiClient;
}

export const DEALERSHIPS: Dealership[] = [
  { id: 'HBC', name: 'Harbour Cars' },
  { id: 'NGM', name: 'Northgate Motors' },
  { id: 'RVA', name: 'Riverside Autos' },
];

export function aReturn(overrides: Partial<DealershipReturn> = {}): DealershipReturn {
  return {
    id: 1,
    dealershipId: 'NGM',
    dealershipName: 'Northgate Motors',
    month: '2026-10',
    enquiries: 431,
    sales: 104,
    conversionRate: 24.13,
    createdAt: '2026-11-03T09:30:00Z',
    updatedAt: '2026-11-03T09:30:00Z',
    ...overrides,
  };
}

export function aReport(rows: DealershipReturn[], totals: ReturnsReport['totals'], filter: Partial<ReturnsReport['filter']> = {}): ReturnsReport {
  return { data: rows, totals, filter: { from: null, to: null, dealershipId: null, ...filter } };
}

/** A promise you resolve or reject later, to hold a component in its loading state. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
