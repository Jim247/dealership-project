/**
 * API contract types. They mirror the PHP API's JSON exactly (bible B7).
 *
 * Features: F3 retrieve, F6 totals, F8 corrections + audit, F9 mock identity.
 */

export type Role = 'dealer' | 'manager';

/**
 * Who the client claims to be. MOCK AUTH (F9): sent as plain headers and not
 * verified. Production would use a real session or token.
 */
export type Identity = { role: 'manager' } | { role: 'dealer'; dealershipId: string };

export interface Dealership {
  id: string;
  name: string;
}

export interface DealershipReturn {
  id: number;
  dealershipId: string;
  dealershipName: string;
  /** YYYY-MM */
  month: string;
  enquiries: number;
  sales: number;
  /** Percentage with at most 2 dp, or null when there were no enquiries. */
  conversionRate: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Totals {
  returnCount: number;
  totalEnquiries: number;
  totalSales: number;
  /** Pooled rate (total sales ÷ total enquiries), or null when there were no enquiries. */
  conversionRate: number | null;
}

export interface ReportFilter {
  from?: string | null;
  to?: string | null;
  dealershipId?: string | null;
}

export interface ReturnsReport {
  data: DealershipReturn[];
  totals: Totals;
  /** The filter the server actually applied. A dealer's is forced to their own dealership. */
  filter: { from: string | null; to: string | null; dealershipId: string | null };
}

export interface NewReturn {
  dealershipId: string;
  month: string;
  enquiries: number;
  sales: number;
}

export interface Correction {
  enquiries: number;
  sales: number;
  reason: string;
}

export interface AuditEntry {
  id: number;
  action: 'created' | 'corrected';
  actorRole: Role | 'seed';
  actorDealershipId: string | null;
  before: { enquiries: number; sales: number } | null;
  after: { enquiries: number; sales: number };
  reason: string | null;
  createdAt: string;
}

/** The single error envelope every API failure uses. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    existing?: DealershipReturn;
  };
}
