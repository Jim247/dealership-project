# Debonaire: dealership reporting

A small dealership data-entry and reporting workflow for the fictional brand
**Debonaire**. Dealerships submit a monthly return (enquiries and completed
sales). Managers review individual returns and totals for any period, and a
command-line script prints the same summary.

| Part | Tech | Folder |
|---|---|---|
| API: save, retrieve, validate, totals | PHP 8.2+ (no framework), SQLite via PDO | [`api/`](api) |
| Data entry + reporting UI | Next.js (App Router), React, TypeScript | [`web/`](web) |
| Reporting summary CLI | Node.js, TypeScript (run with `tsx`) | [`cli/`](cli) |
| Shared types, API client, rate formula | TypeScript | [`shared/`](shared) |

```
 Browser (Next.js page) ──┐
                          ├──► PHP API ──► SQLite (UNIQUE + CHECK constraints)
 Node CLI (summary)    ───┘      │
                                 └─ computes totals + conversion rate (single source of truth)
```

## Run it

**Prerequisites:** PHP 8.2+ with `pdo_sqlite` and `curl` (e.g. `brew install php`),
Composer, and Node.js 20+.

```bash
npm run setup      # npm install, composer install, create + seed the SQLite DB
npm run dev        # PHP API on http://127.0.0.1:8000 and the UI on http://localhost:3000
```

Then open <http://localhost:3000>. Use the **Viewing as** menu in the red bar
to switch between a manager and a dealer (a demo stand-in for sign-in).

```bash
npm run summary -- --from 2026-06 --to 2026-10            # period summary
npm run summary -- --month 2026-08                        # a month with no returns
npm run summary -- --month 2026-07 --dealership HBC       # one dealership
npm test                                                  # PHP suite, then all TypeScript suites
npm run seed:fresh                                        # reset the data to the seed
```

End-to-end tests drive a real browser against the real API. They start their
own servers on ports 8100 and 3100 with a separate database, so they can run
while `npm run dev` is up:

```bash
npx playwright install chromium    # once, before the first run
npm run test:e2e                   # or `npm run test:all` for every suite
```

The CLI exits `0` on success, `1` for API errors, `2` for invalid arguments
and `3` when the API's totals do not match its own rows.

### Sample data

Four fictional dealerships, chosen to exercise every reporting edge case:

| Dealership | Profile | Jun | Jul | Aug | Sep | Oct |
|---|---|---|---|---|---|---|
| Northgate Motors (NGM) | high volume | 412 / 97 | 389 / 88 | – | 450 / 121 | 431 / 104 |
| Riverside Autos (RVA) | mid volume | 128 / 31 | 140 / 29 | – | 117 / 22 | *free to submit* |
| Harbour Cars (HBC) | low volume | 14 / 3 | **0 / 0** | – | 9 / 2 | – |
| Meadow Lane Vehicles (MLV) | no returns yet | – | – | – | – | – |

Cells are enquiries / sales for 2026. **August 2026 has no returns at all.**
All data: 10 returns, 2,090 enquiries, 497 sales, **23.78%**.

## API

JSON in, JSON out. Every error uses one envelope:
`{"error": {"code", "message", "fields"?}}`.

| Endpoint | Purpose |
|---|---|
| `GET /api/returns?from=YYYY-MM&to=YYYY-MM&dealershipId=NGM` | Rows plus server-computed `totals` for that exact filter |
| `GET /api/returns/{id}` | One return |
| `POST /api/returns` | Submit. `201` with `Location`. `422` validation, `409` duplicate. Optional `Idempotency-Key` |
| `PUT /api/returns/{id}` | Correct counts with a `reason` (manager only), audited |
| `GET /api/returns/{id}/audit` | History of a return (manager only) |
| `GET /api/dealerships` | Dealerships visible to the caller |

**Identity (mock):** `X-Debonaire-Role: manager`, or
`X-Debonaire-Role: dealer` plus `X-Debonaire-Dealership: NGM`. Missing
identity gives `401`.

```bash
curl -s -H 'X-Debonaire-Role: manager' 'http://127.0.0.1:8000/api/returns?from=2026-07&to=2026-07'
```

## Business rules and assumptions

- **Validation is server-side** (`api/src/Domain/ReturnValidator.php`). It
  covers required fields, known dealership, strict `YYYY-MM`, non-negative
  whole numbers (true JSON integers: `"5"`, `5.5` and `5.0` are rejected) and
  `sales ≤ enquiries`. All errors come back together. The form repeats these
  checks for instant feedback only.
- **Unknown fields are rejected**, e.g. a client sending its own `totals` or
  `conversionRate`.
- **Months:** a month cannot be in the future. The current month is allowed,
  so a dealership can report as soon as the month is underway. "Current" is
  judged in Europe/London time. *(Assumption.)*
- **Counts are capped at 1,000,000** to catch typos. *(Assumption, not in the brief.)*
- **One return per dealership per month.** A correction changes counts only.
  The dealership and month are immutable, so a wrong month means a new return.
- **Conversion rate** = total sales ÷ total enquiries. It is pooled, never an
  average of per-dealership rates. It shows **N/A** when there are no
  enquiries (not 0%) and is rounded half-up to 2 dp with integer arithmetic,
  so PHP and JavaScript always agree. `fixtures/conversion-cases.json` holds
  vectors that both test suites check.
- **Roles:** a dealer submits and views only their own dealership. A manager
  views everything and is the only role that can correct returns.

## Storage: why SQLite, and what it means for concurrency

SQLite is a file. It is zero-setup for an assessor and still gives real
transactions and constraints:

- **Integrity lives in the database.** `UNIQUE(dealership_id, month)`,
  `CHECK(sales <= enquiries)`, `CHECK(typeof(enquiries) = 'integer')` and
  foreign keys mean even a bug in the PHP validator cannot store bad or
  duplicate data.
- **Writes use `BEGIN IMMEDIATE`**, which takes SQLite's single write lock up
  front, so check-then-insert is race-free. **WAL mode** lets reads continue
  during a write, and `busy_timeout` makes a concurrent writer wait instead of
  failing.
- **Limits:** one writer at a time, and the file must sit on local disk next
  to a single API host. That is fine for this volume (a few hundred returns a
  month), but it would not scale horizontally. A move to PostgreSQL/MySQL
  keeps the same constraints and transaction shape.

## Edge cases

**Duplicate or concurrent submission.** The `UNIQUE` constraint plus a check
inside `BEGIN IMMEDIATE` means two simultaneous requests for the same
dealership and month give exactly one `201` and one `409`. The integration
suite fires 10 at once to prove it, and an end-to-end test drops a real
response mid-flight to check that the retry creates nothing new. The 409 names the dealership, the month
and the original submission date, and points to the correction route. For a
**lost response**, the form sends an `Idempotency-Key` per attempt and reuses
it on retry. The API then replays the original `201`
(`Idempotent-Replayed: true`) instead of a misleading 409. Reusing a key for
different data gives a `422`. The submit button also locks while a request is
in flight.

**Client manipulation.** Nothing the browser sends is trusted. Every rule is
enforced in PHP, the database constraints repeat the critical ones, unknown
fields such as `totals` are rejected, and all totals and rates are computed on
the server. The page only displays them.

**Reporting consistency.** `GET /api/returns` computes totals from exactly the
rows it returns for the same filter, so the table and the totals cannot drift
apart. The page shows those server totals. The CLI fetches the same endpoint,
recomputes the totals from the rows with the shared formula, and refuses to
print (exit `3`) if anything differs. Zero-enquiry returns and empty months
give `0` totals with an `N/A` rate everywhere. Number formatting comes from
one shared module, so the page and the CLI print identical strings.

**Access and audit history.** All access rules live in one class
(`api/src/Domain/AccessPolicy.php`). Dealers are forced to their own
dealership: omitting the filter cannot leak data, and asking for another
dealership gives `403`. Corrections are manager-only, require a reason, and
write an append-only `return_audit` row (before, after, who, when, why) in the
same transaction as the update. Submissions are audited too. **Authentication
is mocked** with headers. In production the actor would come from a verified
session or SSO token, and `AccessPolicy` would not change.

## Testing

| Suite | Command | Covers |
|---|---|---|
| PHP unit | `npm run test:php` | Validator (every rule), month parsing and UK "current month", totals + rate formula (shared vectors), access matrix |
| PHP integration | (same) | Real `php -S` + temp SQLite: 201/422/409/403/401/404/405/415, concurrent duplicates, idempotent replays, filters, totals = sum of rows, empty month, corrections + audit, CORS |
| Shared (Vitest) | `npm run test:ts` | Rate vectors (same file as PHP), formatting, month helpers, API client |
| CLI (Vitest) | (same) | Argument parsing, output format, empty period, mismatch → exit 3, API down → exit 1 |
| Web (Vitest + Testing Library) | (same) | Form success / 422 / 409 feedback, double-click guard, idempotency-key reuse on retry, dealer lock, table loading / empty / error + retry, refresh after submit, filters, manager-only actions, correction dialog, history |
| End-to-end (Playwright) | `npm run test:e2e` | Real Chromium against a production build, the real PHP API and its own SQLite file (reset before each test): submit and refresh, field errors, the duplicate message, a lost response retried without a duplicate, a browser bypassing the form, empty and zero-enquiry months, **page vs CLI figures for five filters**, a manager correction and its history, dealer scope, a failed request and retry |

## Unfinished work

- **End-to-end tests run in Chromium only.** Firefox and WebKit projects
  would be a one-line addition to `playwright.config.ts` each.
- **Idempotency keys never expire.** They should be pruned after ~24 h.
- **No pagination** on `GET /api/returns`. That is fine for the sample volume
  but needed for years of data.
- **Dealers cannot request a correction.** They are told to contact a
  manager. A "correction request" workflow would close that loop.
- **Scope note:** the brief suggests about two hours. This submission
  deliberately goes further and implements all four edge cases rather than
  only describing them.

## Before production

1. **Real authentication** (SSO/OIDC), with the role and dealership taken
   from verified claims, plus CSRF protection if cookies are used. Remove the
   mock headers.
2. **A managed database** (PostgreSQL) with versioned migrations, backups and
   point-in-time recovery. Keep the same constraints.
3. **HTTPS everywhere**, strict CORS per environment, security headers, and
   rate limiting on writes.
4. **Observability:** structured logs with request IDs, error tracking, and
   metrics on 4xx/5xx and submission latency.
5. **Idempotency key expiry, pagination**, and an archival/retention policy
   for the audit log.
6. **CI** running both suites on every PR, plus an end-to-end smoke test
   against a deployed environment.
7. **An accessibility audit** (WCAG 2.2 AA) and a proper design-system review.
8. **Run the API under PHP-FPM** behind nginx (or similar), not the
   built-in dev server.

---

*Debonaire is a fictional brand. Its look is inspired by a UK high-street
bank's website, but no real logos, fonts, imagery or data are used.*
