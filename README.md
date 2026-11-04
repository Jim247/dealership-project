# Message from James

Hello Alex and the team, the following will be my own commentary on the project. 

I approached the task by creating a skills file containing a .md transcription of the task along with my own notes on which tech to use from my point of view. I then asked Claude to recommend a PHP framework, or whether to use a framework as this was a missing part in my knowledge. It recommended plain PHP over Laravel, which I agreed with once I'd reviewed some pros and cons. 

I took Claude's recommendations too on the structure of the PHP API and functions with the edge cases in mind.

The decisions on how the app should behave were mine though. I chose to show N/A rather than 0% when a dealership has no enquiries, to split users into dealers and managers with only managers able to correct a return, and to build all four of the edge cases rather than just describing them. I also reworded some of the text on the page myself. Once it was built, I had Claude run through each edge case in the browser with me, checking the feedback the user actually sees, which turned up a couple of issues I've listed below. 

I know the visuals are not being marked, but I couldn't resist creating a UI similar to the bank you showed me, and it wasn't costly in the design process, I simply asked Claude to visit their website and create something similar. I think it hopefully shows some care and attention to the task, by the way, the naming is all me!

I am aware of some shortcomings in the project which will be documented in greater detail below, but I wanted to point these out in my own words.


- I did run a little over the allotted 2 hours, especially spending time looking at the PHP and edge cases, creating some bespoke learning docs for myself. I wanted to learn something in the process as well as completing the task. The front end styling was not a factor in this. 

- Checking the edge cases in the browser, I found two places where the feedback isn't quite right. If a return saves but the response is lost, and the user changes a figure before retrying, the duplicate message tells them to use 'Correct' on a row that isn't in the table yet, as the table hasn't refreshed. And if the API goes down and comes back, 'Try again' reloads the table but not the dealership dropdowns, so the user can't submit until they reload the page. Both are small fixes, but I've left them as they are for now.

# To make this scalable/general improvements...

I won't add everything here mentioned below in the main body, but some of the more important things from my perspective...

- Idempotency keys never expire. I would have liked to implement a 24 hour expiry on these. This could be done by a simple cron job run on the cloud, or even more simply by deleting any keys older than 24 hours each time a return is submitted, as SQLite doesn't have a scheduler of its own.

- A proper authentication system, ideally with 2FA via a managed service. This would then integrate with the current role based system to control access and CRUD permissions in the app.

- An 'escalate to manager' workflow for dealers to request a correction, which would then be actioned by a manager. This would close the loop on the current system where dealers are told to contact a manager.

- Leaderboard/ filtering by success rate, which would be a nice to have for managers to see how dealerships are performing against each other, filtering and sorting by success rate, date range, etc.

- The ability for managers to void a return, marking it as removed rather than deleting it outright, so it would still be audited and logged. This would be useful for removing test data or incorrect submissions, and in a regulated setting it's safer to keep the history than to truly delete it.

- The page already adjusts to a phone screen, but a properly mobile-first front end (or an app) would be a 'nice to have' for dealers to submit returns on the go.

- PostgreSQL or MySQL database with versioned migrations, backups and point-in-time recovery. The current version of SQLite is fine for the small scale of this project, but would not be suitable for a production environment due to limitations on concurrent writes.

- The app would need to be deployed on a server with HTTPS. There is already a CORS allowlist and some basic security headers, but these would need tightening up for each environment. 

- A more polished or professionally designed front end, with a proper design system and accessibility considerations where appropriate. 

- Pagination on the return endpoints to reduce the amount of data being sent to the client and improve performance.

- Rate limiting on the API. 

- Better live feedback on input validation. The form already checks things like a future month before sending anything, but only when you press Submit, it would be nicer to show errors as you type or move between fields. 

- CI pipeline, running the test suite on every deployment, and ideally a test against a deployed environment.

- If the app were under very heavy and frequent use, a caching layer, queuing and load balancing would be required to deliver a consistent service.

- If the app were used by an international company, with managers viewing data from dealerships in different countries, then dealing with timezones and localisation would be a requirement. At the moment the reporting month is judged in UK time.

- In a regulated sector, retention policies may be required for this data, especially if it came to include more personal data. Every submission and correction is already audit logged, but there would need to be a proper data retention policy for the data in the database, and considerations as to where the data is stored so as to be in line with local regulations e.g. GDPR.


# AI Notes start here ↓

# Debonaire: dealership reporting

A small dealership data-entry and reporting workflow for the fictional brand
**Debonaire**. Dealerships submit a monthly return (enquiries and completed
sales). Managers review individual returns and totals for any period, and a
command-line script prints the same summary.

| Part | Tech | Folder |
|---|---|---|
| API: save, retrieve, validate, totals | PHP 8.3+ (no framework), SQLite via PDO | [`api/`](api) |
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

**Prerequisites:** PHP 8.3+ with `pdo_sqlite` and `curl` (e.g. `brew install php`),
Composer, and Node.js 22.12+ (or 24+). The test tools set these minimums:
PHPUnit 12 needs PHP 8.3 and Vitest 5 needs Node 22.12. Tested on PHP 8.5.12
and Node 22.13.

> **Security warning: use a patched PHP.** In October 2026 PHP fixed two
> critical remote-code-execution flaws, known as "PHP2Shell"
> ([CVE-2026-109618](https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w)
> and [CVE-2026-109619](https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp)),
> which were being exploited in the wild. Every PHP version released before
> 21 October 2026 is affected. Use **8.3.36, 8.4.27, 8.5.12 or later**, and
> check yours with `php -v`.
>
> `composer.json` requires one of those releases. Composer therefore refuses
> to update dependencies on an unpatched PHP, and the API, seed script and
> tests refuse to start on anything older than 8.3.36. Those checks cannot
> catch an older 8.4 or 8.5 release (8.5.11, for example), so `php -v` is the
> real test. Updating is the only complete fix, because no configuration
> setting fully protects an older version. This project's dev server only
> listens on `127.0.0.1`, which limits the exposure, but an unpatched PHP is
> still unsafe to keep on any machine.

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

### Trying the API with curl

These examples need `npm run dev` running and the sample data loaded. Some of
them change the data, so run `npm run seed:fresh` afterwards to put it back.
`-i` shows the status code and headers as well as the body, and piping the
output into `jq` makes the JSON easier to read, if you have it installed.

**Reading data**

```bash
# Is the API up? This is the only endpoint that needs no identity.
curl -s http://127.0.0.1:8000/api/health

# Every dealership, as a manager
curl -s -H 'X-Debonaire-Role: manager' http://127.0.0.1:8000/api/dealerships

# Returns for June to September, with the server's totals for exactly those rows
curl -s -H 'X-Debonaire-Role: manager' 'http://127.0.0.1:8000/api/returns?from=2026-06&to=2026-09'

# The same request as a Harbour Cars dealer: the filter is forced to their own dealership
curl -s -H 'X-Debonaire-Role: dealer' -H 'X-Debonaire-Dealership: HBC' 'http://127.0.0.1:8000/api/returns?from=2026-06&to=2026-09'

# August 2026 has no returns: zero totals and a null rate (shown as N/A)
curl -s -H 'X-Debonaire-Role: manager' 'http://127.0.0.1:8000/api/returns?from=2026-08&to=2026-08'

# One return by id
curl -s -H 'X-Debonaire-Role: manager' http://127.0.0.1:8000/api/returns/1
```

**Submitting a return, retrying it, and submitting it twice**

```bash
# Save Riverside Autos' October return: 201 Created, with a Location header
curl -si -X POST http://127.0.0.1:8000/api/returns \
  -H 'X-Debonaire-Role: manager' -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: readme-example-0001' \
  -d '{"dealershipId":"RVA","month":"2026-10","enquiries":131,"sales":27}'

# A retry after a lost response: the same key replays the original 201 with
# "Idempotent-Replayed: true", and nothing new is saved
curl -si -X POST http://127.0.0.1:8000/api/returns \
  -H 'X-Debonaire-Role: manager' -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: readme-example-0001' \
  -d '{"dealershipId":"RVA","month":"2026-10","enquiries":131,"sales":27}'

# A second return for the same dealership and month: 409 duplicate_return
curl -s -X POST http://127.0.0.1:8000/api/returns \
  -H 'X-Debonaire-Role: manager' -H 'Content-Type: application/json' \
  -d '{"dealershipId":"RVA","month":"2026-10","enquiries":140,"sales":30}'
```

**Requests the API refuses**

```bash
# No identity headers: 401 missing_identity
curl -s http://127.0.0.1:8000/api/returns

# Bad figures plus a client-calculated total: 422, with a message for each field
curl -s -X POST http://127.0.0.1:8000/api/returns \
  -H 'X-Debonaire-Role: manager' -H 'Content-Type: application/json' \
  -d '{"dealershipId":"HBC","month":"2026-13","enquiries":5,"sales":9,"totals":{"totalSales":999}}'

# A dealer submitting for another dealership: 403 forbidden
curl -s -X POST http://127.0.0.1:8000/api/returns \
  -H 'X-Debonaire-Role: dealer' -H 'X-Debonaire-Dealership: HBC' -H 'Content-Type: application/json' \
  -d '{"dealershipId":"NGM","month":"2026-05","enquiries":10,"sales":2}'

# A dealer asking for another dealership's returns: 403 forbidden
curl -s -H 'X-Debonaire-Role: dealer' -H 'X-Debonaire-Dealership: HBC' 'http://127.0.0.1:8000/api/returns?dealershipId=NGM'

# A method the endpoint doesn't support: 405, with an Allow header
curl -si -X DELETE -H 'X-Debonaire-Role: manager' http://127.0.0.1:8000/api/returns/1
```

**Corrections and history (managers only)**

```bash
# Correct Harbour Cars' June return (id 8 in the sample data), giving a reason
curl -s -X PUT http://127.0.0.1:8000/api/returns/8 \
  -H 'X-Debonaire-Role: manager' -H 'Content-Type: application/json' \
  -d '{"enquiries":16,"sales":4,"reason":"Two web enquiries were missed in the CRM export"}'

# Its history: the original submission, then the correction with before, after and reason
curl -s -H 'X-Debonaire-Role: manager' http://127.0.0.1:8000/api/returns/8/audit

# A dealer trying to correct it: 403, because only managers can correct
curl -s -X PUT http://127.0.0.1:8000/api/returns/8 \
  -H 'X-Debonaire-Role: dealer' -H 'X-Debonaire-Dealership: HBC' -H 'Content-Type: application/json' \
  -d '{"enquiries":20,"sales":5,"reason":"Trying to change our own figures"}'
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
9. **Keep PHP patched.** Start on a release with the October 2026
   "PHP2Shell" fixes (8.3.36, 8.4.27, 8.5.12 or later), subscribe to PHP's
   security announcements, and have a tested way to roll out an emergency PHP
   update within hours. In that incident, governments told site owners to
   take sites offline until they had patched.

---

*Debonaire is a fictional brand. Its look is inspired by a UK high-street
bank's website, but no real logos, fonts, imagery or data are used.*
