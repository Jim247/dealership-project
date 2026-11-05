---
name: dealership-spec
description: The bible for the Debonaire dealership reporting technical exercise. Holds the verbatim spec, every agreed decision, the API contract, business rules, data model, style guide, test plan, and commenting and git conventions. Load it before any planning, coding, testing, styling or README work in this repo, and treat it as the source of truth when anything is ambiguous.
---

# Debonaire Dealership Reporting: the bible

This file is the single source of truth for the exercise. **Part A** is the
employer's spec, transcribed verbatim. **Part B** is every decision agreed with
James on 2026-11-02, plus the contracts derived from those decisions.

If code, tests or the README disagree with this file, this file wins. If this
file is wrong, change it first, with a commit and a reason, and then change the code.

Progress is tracked in `TODO.md` at the repo root.

---

## Part A: Verbatim spec

> Source: *Technical Exercise – Dealership Reporting* (2 pages, PDF).
> "Santander" in the original is the employer's client. In our build the
> company is called **Debonaire**.

### Technical Exercise: Dealership Reporting

**Purpose:** Assess PHP, Next.js and Node.js through data capture, reporting
accuracy, data integrity and engineering judgement. A simple user interface is
required.

#### 1. Objective

Build a small dealership data-entry and reporting workflow using PHP, Next.js
and/or Node.js. The exercise is intended to assess integration, business rules,
reporting accuracy, automated testing and production engineering judgement.

Please stop after two hours even if you have not completed everything.
Prioritise a working flow and explain anything unfinished.

#### 2. Scenario

Our MI Business websites for Santander allow users to enter dealership
information and review individual and aggregate results. For this exercise,
build a simplified reporting workflow using fictional dealerships. No client
data or external integrations are required.

#### 3. Requirements

**3.1 Dealership data**
- Use at least three fictional dealerships and sample returns, including a
  return with zero enquiries.
- Each return records a dealership identifier, reporting month, enquiry count
  and completed sales count.

**3.2 Submit a return using PHP**
- Provide PHP endpoints to save and retrieve returns. Validate required fields,
  known dealerships, valid months and non-negative whole-number counts on the
  server.
- For this exercise, sales are conversions from the same enquiries, so sales
  cannot exceed enquiries. Reject a second return for the same dealership and
  month with a useful error.

**3.3 Enter and review data using Next.js**
- Provide a simple form that submits to the PHP API and displays success or
  validation feedback.
- Display saved returns in a filterable table and refresh the results after a
  successful submission.
- Show total enquiries and total sales. Handle loading, empty and failed
  requests clearly.

**3.4 Produce a summary using Node.js**
- Create a small command-line script that accepts a reporting time period,
  retrieves the returns from the PHP API and prints the same totals and overall
  conversion rate as the page.

**3.5 Testing and handover**
- Add a few focused automated tests for validation and reporting calculations.
- Include a short README with run instructions, assumptions, unfinished work and
  what you would address before production use.

#### 4. Edge Cases to Consider

You do not necessarily need to fully implement every edge case below, but be
prepared to explain how you would handle them.

- **Duplicate or concurrent submission:** A submission succeeds but the
  response is lost, or two requests arrive for the same dealership and month.
  How would you avoid duplicate records or misleading feedback?
- **Client manipulation:** The browser bypasses validation or sends its own
  calculated totals. How would you ensure that stored data and reported results
  remain trustworthy?
- **Reporting consistency:** Dealerships have very different enquiry volumes,
  some have no enquiries, and another month has no returns. How would you
  ensure the table, totals and Node.js summary remain consistent?
- **Access and audit history:** In production, a dealership should only submit
  its own data and managers may review multiple dealerships. How would you
  enforce access and record later corrections? Authentication is discussion
  only.

#### 5. Technology

- Use PHP for the API, Next.js for the interface and Node.js for the reporting
  script. JavaScript or TypeScript is acceptable.
- A database is optional. SQLite or a simple file store is acceptable; explain
  how your choice affects concurrency and data integrity.
- We are more interested in correctness, clear code and reasoning than
  infrastructure. Deployment, authentication and elaborate styling are not
  required. A polished UI is not part of the assessment.

---

## Part B: Agreed decisions (2026-11-02)

### B1. Decision log

| # | Topic | Decision |
|---|-------|----------|
| D1 | Time box | **Ignore the 2-hour box** and build everything to a high standard. The README must still list anything unfinished (spec §3.5). |
| D2 | PHP runtime | Homebrew `php` + `composer`, served by PHP's built-in server (`php -S`). No Docker. |
| D3 | PHP structure | **Plain PHP, no framework.** Front controller, a tiny router, PDO, and small single-purpose classes. |
| D4 | Storage | **SQLite via PDO.** Integrity is enforced by the database itself (UNIQUE, CHECK, FK), not only by app code. |
| D5 | Zero enquiries | Conversion rate shows **`N/A`**, otherwise **2 decimal places** (e.g. `23.45%`). |
| D6 | Valid month | Strict `YYYY-MM`, month `01`–`12`, **not after the current month** (Europe/London clock). |
| D7 | CLI period | `--from YYYY-MM` and `--to YYYY-MM` (both inclusive, either optional). `--month` is a single-month shortcut. |
| D8 | Totals source | **PHP computes the totals** and returns them with the rows. The page displays the server totals. The CLI **recomputes from the rows** with the shared TS formula and **fails loudly on any mismatch**. |
| D9 | Tests | PHP unit + PHP API integration (main suite), **plus light TS tests** (shared formula, CLI, web form/states). One root `npm test` runs everything. |
| D10 | Look & feel | **Santander-inspired, original Debonaire branding.** Copy no Santander logo, fonts, imagery or copy. See B9. |
| D11 | Language | **TypeScript** for web, CLI and shared code. The CLI runs with `tsx`. |
| D12 | Commits | **Conventional Commits, one per coherent feature step.** Every commit ends with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer. |
| D13 | Remote | **Local git only.** Never push or create a remote without James asking. |
| D14 | Edge cases implemented | **All four**: idempotency key, corrections with audit trail, mock role switch, and a seeded month with no returns. |
| D15 | Roles | **Dealer**: submits and views only their own dealership. **Manager**: views all dealerships and is the **only** role that can correct a return. |
| D16 | Seed data | **4 fictional dealerships** (B6) covering every edge case. |
| D17 | Comments | Clear comments that name the feature, **especially in PHP** (see B10). |

### B2. Repository layout

```
dealership/
├── api/                      PHP API (namespace Debonaire\Api)
│   ├── public/index.php      front controller: the only web-exposed PHP file
│   ├── src/
│   │   ├── App.php           composition root + the ONE place errors map to HTTP status codes
│   │   ├── Http/             Router, Request, JsonResponse, Cors, MockIdentity, HttpError
│   │   ├── Controller/       ReturnsController, DealershipsController (thin: HTTP ↔ service)
│   │   ├── Service/          ReturnService (use cases: list, get, submit, correct, history)
│   │   ├── Domain/           ReturnValidator, Month, ReportCalculator, AccessPolicy, Role, Actor,
│   │   │                     Clock (+System/Fixed), value objects, Exception/ (HTTP-agnostic errors)
│   │   └── Persistence/      Database, DealershipRepository, ReturnRepository, AuditRepository,
│   │                         IdempotencyStore, Seeder
│   ├── database/schema.sql   tables + constraints
│   ├── database/seed.php     idempotent seed script
│   ├── tests/Unit/           PHPUnit unit tests
│   ├── tests/Integration/    PHPUnit HTTP tests against a real `php -S` + temp DB
│   ├── composer.json
│   └── phpunit.xml
├── shared/                   TS package: API types + canonical conversion-rate formula
├── cli/                      Node.js summary script (TS, run with tsx)
├── web/                      Next.js App Router app (TS)
├── fixtures/conversion-cases.json   rate vectors read by BOTH PHPUnit and Vitest
├── scripts/check-setup.mjs   setup pre-flight check + opt-in php.ini fix (plain Node, no deps)
├── package.json              npm workspaces (shared, cli, web) + root scripts
├── README.md
├── TODO.md
└── CLAUDE.md
```

Root scripts: `npm run setup` (tool check + install + composer install +
migrate + seed), `npm run setup:php-ini` (switch on PHP's extensions),
`npm run dev` (PHP on :8000 and Next on :3000 together), `npm run seed`,
`npm run summary -- --from … --to …`, and `npm test` (PHP suite, then TS suites).

### B3. Feature register

Every feature has an ID. PHP docblocks, test names and commit scopes reference
these IDs so an assessor can trace a requirement from spec, to code, to test.

| ID | Feature | Spec ref | Layer |
|----|---------|----------|-------|
| F1 | Fictional dealerships + sample returns (incl. zero-enquiry return, empty month) | §3.1, §4 | api seed |
| F2 | Save a return (`POST /api/returns`) | §3.2 | api |
| F3 | Retrieve returns: list with filters, and get one | §3.2, §3.3 | api |
| F4 | Server-side validation (required, known dealership, valid month, non-negative whole numbers, sales ≤ enquiries, no unknown fields) | §3.2, §4 | api |
| F5 | Duplicate rejection: same dealership + month gives 409 with a useful message, race-safe | §3.2, §4 | api + db |
| F6 | Totals + overall conversion rate computed by the server | §3.3, §3.4, §4 | api |
| F7 | Idempotent submission (`Idempotency-Key`) | §4 | api + web |
| F8 | Corrections with audit trail (manager only) | §4 | api + web |
| F9 | Mock access control: dealer vs manager (NOT real auth) | §4 | api + web |
| F10 | Entry form with success / validation / duplicate feedback | §3.3 | web |
| F11 | Filterable returns table + totals, refreshed after submit/correct; loading/empty/error states | §3.3 | web |
| F12 | CLI summary with period args + server cross-check | §3.4 | cli |
| F13 | Shared conversion-rate formula + parity fixtures | §4 | shared |
| F14 | README handover | §3.5 | docs |

### B4. Business rules (authoritative)

**Return fields:** `dealershipId`, `month`, `enquiries`, `sales`.

**Validation (F4).** This is enforced on the server. The browser's checks only
help the user.
1. The body must be a JSON object. Anything else gives `400 invalid_json`.
2. **Unknown fields are rejected** (e.g. a client-sent `totals` or
   `conversionRate`), giving `422` with a message per field. The server never
   trusts client-calculated values.
3. `dealershipId`: required, a string, and must exist in `dealerships`.
4. `month`: required, a string matching `^\d{4}-(0[1-9]|1[0-2])$`, and **≤ the
   current month** in Europe/London.
5. `enquiries`, `sales`: required, and must be **JSON integers** ≥ 0. Strings
   (`"5"`), floats (`5.5`, `5.0`), booleans and null are rejected. The upper
   sanity cap is `1_000_000` (an assumption, listed in the README).
6. `sales ≤ enquiries` (sales are conversions of the same enquiries). This is
   only checked once both are individually valid.
7. **All field errors are collected and returned together**, not one at a time.

**Duplicates (F5).** One return per `(dealershipId, month)`, enforced by a
`UNIQUE` constraint, so two concurrent requests cannot both succeed. A
violation gives `409 duplicate_return` with a human message naming the
dealership, the month and when the original was submitted, and suggesting a
correction instead. It also includes the existing return's `id`.

**Idempotency (F7).** `POST /api/returns` accepts an optional
`Idempotency-Key` header (the web form always sends a UUID v4 per form
submission attempt, reused on retry).
- Same key + same payload hash: replay the **original 201** response with the
  header `Idempotent-Replayed: true`. No second record is created, and there is
  no misleading 409.
- Same key + different payload: `422 idempotency_key_reused`.
- Key lookup, insert and key store happen in **one `BEGIN IMMEDIATE`
  transaction**.

**Totals and conversion rate (F6, F13).**
- Totals are computed **from exactly the rows returned for the same filter**,
  so the table and totals can never disagree.
- `totalEnquiries = Σ enquiries`, `totalSales = Σ sales`, `returnCount = rows`.
- Overall conversion rate = `totalSales ÷ totalEnquiries` (a pooled rate,
  **never an average of per-dealership rates**, because volumes differ wildly).
- If `totalEnquiries = 0` (including no rows), the rate is `null`, displayed as `N/A`.
- **Canonical integer formula** (identical in PHP and TS, which avoids float
  drift and keeps rounding identical):
  `basisPoints = floor((sales × 10000 × 2 + enquiries) ÷ (enquiries × 2))`,
  which rounds half up. Then `rate = basisPoints ÷ 100` and it is displayed with
  exactly 2 dp + `%`.
  PHP uses `intdiv`. TS uses integer `Math.floor` (values stay far below 2^53).
- Each row also carries its own `conversionRate` (null when enquiries = 0).
- `fixtures/conversion-cases.json` holds the shared test vectors. Both PHPUnit
  and Vitest must pass every vector.

**Period filter.** `from` and `to` are `YYYY-MM`, inclusive, and either may be
omitted. If `from > to` the result is `422`. They are compared as strings
(valid because `YYYY-MM` sorts lexicographically). There is an optional
`dealershipId` filter too.
Order: `month DESC`, then dealership name `ASC`.

**Number display.** en-GB thousands separators (`1,234`) in both the page and the CLI.

### B5. Access model (F9): mock only, clearly labelled

There is no real authentication (spec §4/§5). Identity comes from **mock
headers** that the web app's role switcher sets:

- `X-Debonaire-Role: dealer | manager`
- `X-Debonaire-Dealership: <id>` (required when role = dealer)

If the headers are missing or invalid, the response is `401 missing_identity`.
This is secure by default, and the CLI sends `manager`.

| Action | Dealer | Manager |
|--------|--------|---------|
| `GET /api/dealerships` | own only | all |
| `GET /api/returns` | **forced** to own dealership. Asking for another gives `403` | all, filterable |
| `GET /api/returns/{id}` | own only, else `403` | any |
| `POST /api/returns` | own dealership only, else `403` | any |
| `PUT /api/returns/{id}` (correct) | `403` | ✅ |
| `GET /api/returns/{id}/audit` | `403` | ✅ |

All rules live in one `AccessPolicy` class. Controllers ask it and never inline
role checks. The code comments and README must state this is a stand-in for real
auth (session/JWT/SSO) and explain what production would do.

### B6. Data model (SQLite)

PRAGMAs on every connection: `foreign_keys = ON`, `journal_mode = WAL`,
`busy_timeout = 5000`. Writes use `BEGIN IMMEDIATE`.

```sql
CREATE TABLE dealerships (
  id    TEXT PRIMARY KEY,               -- short code, e.g. 'NGM'
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE returns (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  dealership_id  TEXT    NOT NULL REFERENCES dealerships(id),
  month          TEXT    NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'),
  enquiries      INTEGER NOT NULL CHECK (typeof(enquiries) = 'integer' AND enquiries >= 0),
  sales          INTEGER NOT NULL CHECK (typeof(sales) = 'integer' AND sales >= 0 AND sales <= enquiries),
  created_at     TEXT    NOT NULL,      -- ISO-8601 UTC
  updated_at     TEXT    NOT NULL,
  UNIQUE (dealership_id, month)         -- F5: race-safe duplicate rejection
);

CREATE TABLE return_audit (             -- F8: append-only history
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id           INTEGER NOT NULL REFERENCES returns(id),
  action              TEXT    NOT NULL CHECK (action IN ('created', 'corrected')),
  actor_role          TEXT    NOT NULL,
  actor_dealership_id TEXT,
  before_json         TEXT,             -- NULL for 'created'
  after_json          TEXT    NOT NULL,
  reason              TEXT,             -- required for 'corrected'
  created_at          TEXT    NOT NULL
);

CREATE TABLE idempotency_keys (         -- F7
  key           TEXT PRIMARY KEY,
  request_hash  TEXT    NOT NULL,       -- sha256 of canonical JSON payload + actor
  return_id     INTEGER NOT NULL REFERENCES returns(id),
  created_at    TEXT    NOT NULL
);
```

The DB constraints duplicate the PHP validation on purpose (defence in depth):
even a bug in the validator cannot store `sales > enquiries` or a duplicate.

**Seed (F1).** The current date is 2026-11. Month **2026-08 is deliberately
empty** for every dealership.

| ID | Name | Profile | 2026-06 | 2026-07 | 2026-08 | 2026-09 | 2026-10 |
|----|------|---------|---------|---------|---------|---------|---------|
| NGM | Northgate Motors | high volume | 412 / 97 | 389 / 88 | — | 450 / 121 | 431 / 104 |
| RVA | Riverside Autos | mid volume | 128 / 31 | 140 / 29 | — | 117 / 22 | — (left free for demo) |
| HBC | Harbour Cars | low volume | 14 / 3 | **0 / 0** (zero enquiries) | — | 9 / 2 | — |
| MLV | Meadow Lane Vehicles | new, no returns yet | — | — | — | — | — |

(cells are `enquiries / sales`). The seed is idempotent: re-running it never
duplicates rows. It writes `created` audit rows too.

### B7. API contract

Base URL: `http://127.0.0.1:8000` (127.0.0.1 rather than `localhost` avoids
IPv4/IPv6 ambiguity with `php -S`). The API accepts and returns JSON only.
CORS allows `http://localhost:3000` and `http://127.0.0.1:3000` (override with
`DEBONAIRE_ALLOWED_ORIGINS`), including the custom headers above, and preflight
`OPTIONS` returns `204`.

**Error envelope (always this shape):**
```json
{ "error": { "code": "validation_failed", "message": "Human-readable summary.", "fields": { "sales": "Sales cannot exceed enquiries (12)." } } }
```
`fields` is only present for field-level problems.

| Method & path | Success | Errors |
|---|---|---|
| `GET /api/health` | `200 {"status":"ok"}` | — |
| `GET /api/dealerships` | `200 {"data":[{id,name}]}` | 401 |
| `GET /api/returns?from&to&dealershipId` | `200 {"data":[Return], "totals":Totals, "filter":{from,to,dealershipId}}` | 401, 403, 422 (bad filter) |
| `GET /api/returns/{id}` | `200 {"data":Return}` | 401, 403, 404 |
| `POST /api/returns` (+ `Idempotency-Key`) | `201 {"data":Return}` + `Location` header | 400, 401, 403, 409 `duplicate_return`, 422 `validation_failed` / `idempotency_key_reused` |
| `PUT /api/returns/{id}` body `{enquiries, sales, reason}` | `200 {"data":Return}` | 400, 401, 403, 404, 422 |
| `GET /api/returns/{id}/audit` | `200 {"data":[AuditEntry]}` | 401, 403, 404 |
| anything else | — | `404 not_found` / `405 method_not_allowed` |

```ts
type Return = { id: number; dealershipId: string; dealershipName: string; month: string;
  enquiries: number; sales: number; conversionRate: number | null; createdAt: string; updatedAt: string };
type Totals = { returnCount: number; totalEnquiries: number; totalSales: number; conversionRate: number | null };
type AuditEntry = { id: number; action: 'created' | 'corrected'; actorRole: string; actorDealershipId: string | null;
  before: Pick<Return,'enquiries'|'sales'> | null; after: Pick<Return,'enquiries'|'sales'>; reason: string | null; createdAt: string };
```

Corrections (F8): `dealershipId` and `month` are **immutable**, so a wrong
month is a new return. `reason` is required (a non-empty string, max 500
chars). The same validation applies (whole numbers, sales ≤ enquiries). The
update and its audit row commit in **one transaction**.

### B8. Node CLI (F12)

```
npm run summary -- --from 2026-06 --to 2026-10 [--dealership NGM] [--api http://127.0.0.1:8000]
npm run summary -- --month 2026-08
```

Output (the en-GB numbers and the rate formatting must match the web page exactly):
```
Debonaire dealership summary
Period:           2026-06 to 2026-10
Dealership:       All
Returns:          10
Total enquiries:  2,090
Total sales:      497
Conversion rate:  23.78%
```
- Empty period: totals are 0, the rate is `N/A`, plus a line `No returns found for this period.`
- **Cross-check:** recompute the totals from `data` using `shared`'s formula. If
  anything differs from the server's `totals`, print both and exit `3`.
- Exit codes: `0` ok, `1` API/network error (with a readable message, no stack
  trace), `2` invalid arguments (with usage text), `3` totals mismatch.
- Arguments are validated locally with the same month rules as the API.

### B9. Debonaire look & feel (F10, F11)

Reference notes were taken from santander.co.uk on 2026-11-02. We use the same
*feel* with **original Debonaire branding**: no Santander logo, font files,
imagery or copy.

| Token | Value | Use |
|---|---|---|
| `--brand` | `#EC0000` | top bar, primary buttons, focus accents |
| `--brand-dark` | `#990000` | links, hover state of primary |
| `--text` | `#212529` | body text |
| `--text-muted` | `#6F7779` | hints, captions |
| `--band` | `#EFF6F9` | pale blue-grey section bands / page background strips |
| `--band-strong` | `#CEDEE7` | table header, dividers |
| `--surface` | `#FFFFFF` | cards |
| `--input-border` | `#949494` | 2px input borders |
| `--success` | `#32AE88` | success banner accent |
| `--footer` | `#222222` | footer text |

- **Type:** Santander uses its proprietary "Santander Text/Headline". We use
  **Open Sans** via `next/font/google` (body 16px/400, headings 500, h1 32–40px).
- **Buttons:** pill-shaped (`border-radius: 20px`), padding `6px 20px 8px`.
  Primary is red with white text. Secondary is white with a red text and red
  1px border.
- **Inputs:** `border-radius: 30px`, 2px `--input-border`, 40px tall. Focus
  shows a red ring. Errors show red text under the field, linked with
  `aria-describedby`.
- **Layout:** red top bar (~60px) with the **Debonaire wordmark** on the left
  (an original mark: a simple bow-tie glyph + "Debonaire" in white) and the
  **mock role switcher** on the right. Content sits in a **960px** max-width
  container on a white background, with `--band` strips separating sections.
  The footer is simple, with a "Fictional demo — not a real bank" note.
- **Cards:** white, subtle shadow `0 4px 8px rgba(0,0,0,.08)`, radius 8px.
- **Accessibility:** labelled inputs, `role="alert"` for errors,
  `aria-live="polite"` for the success and loading states, and visible focus.
  Colour is never the only signal.
- The styling is plain CSS. Tokens and shared primitives (`.card`, `.btn`,
  `.field`, `.input`, `.alert`) live in `web/src/app/globals.css`, and
  component layout lives in CSS modules. There is no Tailwind and no UI kit.

**Page (`/`, single page):**
1. **Submit a return** card (F10): dealership select (locked to own for
   dealers), month (`type="month"`, `max` = current month), enquiries, sales,
   and a submit button with a pending state that blocks double-clicks. Feedback
   is a success banner (naming dealership + month), field errors from the 422,
   or a 409 message with a "correct it instead" hint for managers.
2. **Returns** card (F11): filters (from, to, dealership for managers only),
   **totals tiles** (Returns · Total enquiries · Total sales · Conversion rate,
   all from the server `totals`), and the table (Dealership, Month, Enquiries,
   Sales, Conversion, plus an Actions column for managers with **Correct** and
   **History**).
   - Loading: skeleton rows + `aria-busy`. Empty: "No returns for this period"
     + a hint. Failed: an error message + **Retry** button.
   - The table **refetches after a successful submit or correction**.
3. **Correct** dialog (F8): enquiries, sales, reason, then a PUT. It shows
   validation errors inline and refreshes the table on success. **History**
   shows the audit entries.

The browser calls the PHP API directly (`NEXT_PUBLIC_API_URL`, default
`http://127.0.0.1:8000`) from client components.

### B10. Commenting standard (D17)

**PHP (heaviest commenting):**
- Every file starts with `declare(strict_types=1);` and a **file docblock**
  saying what the file does, which **feature IDs** it implements and the **spec
  section**, e.g.
  ```php
  /**
   * Validates a dealership return before it is saved.
   *
   * @feature F4 Server-side validation (spec §3.2, §4 "Client manipulation")
   */
  ```
- Every class and public method has a docblock (`@param`, `@return`, `@throws`).
- Business rules get a **"why" comment** at the point of enforcement, e.g.
  `// Sales are conversions of the same enquiries, so they can never exceed them (spec §3.2).`
- Each mock-auth touchpoint carries `// MOCK AUTH (F9): replace with real session/JWT in production.`
- Comments explain *why*, never restate *what* the code says.

**TypeScript:** file header comment with the feature IDs, TSDoc on exported
functions, and why-comments on non-obvious state handling (refresh, idempotency
key reuse, cross-check).

**Tests:** names state the rule, e.g. `test_rejects_sales_greater_than_enquiries`
or `it('shows N/A when total enquiries is zero')`. Each test file's header lists
the features it covers.

### B11. Test plan (D9)

Everything runs from the root with `npm test`. The PHP suite runs first.

**PHP unit (`api/tests/Unit`):**
- `ReturnValidatorTest` (F4): valid passes; each required field is missing;
  unknown dealership; bad month format; month `13`/`00`; future month; current
  month allowed; string/float/bool/null/negative counts; over the cap; sales >
  enquiries rejected; sales = enquiries allowed; 0/0 allowed; unknown fields
  rejected; multiple errors collected together.
- `MonthTest`: parsing, comparison and the current month in Europe/London
  (clock injected, never `time()` in the domain).
- `ReportCalculatorTest` (F6/F13): sums, the pooled rate (not an average of
  rates), zero enquiries gives null, empty list, mixed volumes, and **every
  vector in `fixtures/conversion-cases.json`**.
- `AccessPolicyTest` (F9): the full matrix in B5.

**PHP integration (`api/tests/Integration`):** a bootstrap starts `php -S` on a
free port with a **temp SQLite file** and seeds it fresh per test class.
- POST 201 + `Location`, then GET by id returns it (F2/F3).
- 422 body shape and per-field messages, invalid JSON 400, and client-sent
  `totals` rejected (F4).
- Duplicate gives 409 with a useful message. **Concurrent duplicates**
  (`curl_multi`, ~10 parallel) give exactly one 201 and the rest 409 (F5).
- Idempotent replay returns the same 201 + header and one row only. Key reuse
  with a different payload gives 422 (F7).
- Filters (from/to/dealership), totals match the rows, the empty month (2026-08)
  gives zero totals + a null rate, and the zero-enquiry row has a null rate (F3/F6).
- Dealer scoping: forced filter, 403 on others, 401 without headers (F9).
- Manager PUT correction gives 200 + an audit row with before/after/reason;
  dealer PUT gives 403; a missing reason gives 422 (F8).
- CORS preflight gives 204 with the right headers.

**TypeScript (Vitest):**
- `shared`: the formula passes every fixture vector (parity with PHP), and the
  formatting covers `N/A`, 2 dp and en-GB separators.
- `cli`: argument parsing (valid, missing, bad month, from > to, `--month`), the
  output format, the empty-period message, mismatch gives exit 3, and an API
  failure gives exit 1 (fetch is mocked).
- `web` (React Testing Library, fetch mocked): the form shows field errors from
  a 422, shows the 409 message, shows success and triggers a table refetch, and
  the submit button is disabled while pending. The table shows the loading,
  empty and error + retry states, and the totals show `N/A` for zero enquiries.
- `scripts` (plain JS, added 2026-11-05): the Node and PHP version rules, which
  extensions each OS needs, and the php.ini edit (uncomment, append,
  `extension_dir`, CRLF kept).

**End-to-end (Playwright, added after the main build at James's request):**
`npm run test:e2e` starts its own PHP API (port 8100) and a production
Next.js build (port 3100, built into `.next-e2e`) with its own SQLite file
(`api/var/e2e.sqlite`, reset before each test), so it never touches the dev
servers or dev data. It covers:
- submit and refresh, field errors, and the duplicate message;
- a lost response retried without a duplicate (`route.fetch` then `abort`);
- a browser bypassing the form;
- empty and zero-enquiry months;
- page vs CLI figures for five filters;
- a manager correction and its history;
- dealer scope, and a failed request with retry.

Tests scope alerts to their card, because Next.js adds a page-level
`role="alert"` route announcer. It is kept out of `npm test` so that suite
stays fast; `npm run test:all` runs everything.

### B12. Git conventions (D12, D13)

- Conventional Commits: `feat(api): …`, `fix(web): …`, `test(api): …`,
  `docs: …`, `chore: …`. Scopes are `api`, `web`, `cli`, `shared`, `repo`, `docs`.
- One coherent step per commit. The suite must pass at every commit from the
  first test onwards.
- Every commit message ends with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Local only. Never push, add a remote, or rewrite published history.
- Never commit `*.sqlite`, `vendor/`, `node_modules/`, `.next/`, or `.env*` (except `.env.example`).

### B13. README must contain (F14, spec §3.5)

1. What it is (one paragraph) + architecture sketch.
2. Prerequisites + **run instructions**: setup, dev, seed, summary and test commands.
3. **Assumptions** (e.g. the current-month rule, the 1,000,000 cap, immutable
   dealership/month, Europe/London clock, the mock auth headers).
4. **Storage choice**: why SQLite, and how WAL + UNIQUE/CHECK + `BEGIN
   IMMEDIATE` affect concurrency and integrity, plus the limits (single writer,
   file-local) and when to move to Postgres/MySQL.
5. **Edge cases**: one section per §4 bullet, saying what was implemented and how.
6. **Testing**: what each suite covers and how to run it.
7. **Unfinished work** (honest, even with the time box ignored).
8. **Before production**: real auth (SSO/JWT) + per-dealership authorisation,
   HTTPS, a managed DB + migrations, rate limiting, structured logging and
   monitoring, idempotency key expiry, CSRF/CORS hardening, backups, CI,
   accessibility audit, and data retention.
9. A note that this is a fictional brand inspired by a banking site's look.

### B14a. Rules added during the build (2026-11-02)

These are small decisions made while implementing. Each is enforced in code
and covered by tests.

- A correction that changes nothing gives `422` (it would only add noise to
  the audit trail).
- A non-JSON `Content-Type` on POST/PUT gives `415 unsupported_media_type`. A
  body over 16 KB gives `413`.
- `Idempotency-Key` must match `^[A-Za-z0-9_-]{8,128}$`, else `400 invalid_idempotency_key`.
- Seed rows are audited with `actor_role = 'seed'`.
- Unexpected exceptions give `500 internal_error` with a generic message. The
  details go to the server log only.
- The integration tests freeze the clock with `DEBONAIRE_FIXED_NOW=2026-11-15T12:00:00Z`.
- The web app remembers the demo identity in `localStorage` (a per-browser
  convenience only).
- Toolchain at build time: PHP via Homebrew, PHPUnit 11/12, Node 22,
  TypeScript 7, Vitest 5, Next.js 16, React 19.
- Minimum versions (2026-11-03): PHP 8.3, because the locked PHPUnit 12
  needs it, and Node 22.12 or 24+, because Vitest 5 needs it. `composer.json`,
  the root `package.json` `engines` field and the README all state these.
- PHP must be a release with the October 2026 "PHP2Shell" fixes
  (CVE-2026-109618, CVE-2026-109619): 8.3.36, 8.4.27, 8.5.12 or later.
  `composer.json` requires `~8.3.36 || ~8.4.27 || ~8.5.12 || >=8.6`. The
  README carries a security warning, plus a before-production item on keeping
  PHP patched.
- Scripts must run on macOS and Windows (2026-11-05). `npm run dev:api` runs
  `composer --working-dir=api serve`, which sets `PHP_CLI_SERVER_WORKERS=4`
  with Composer's cross-platform `@putenv` (Windows has no workers and runs one
  process). `npm run test:php` runs `php vendor/bin/phpunit`. The integration
  tests write to `NUL` and skip `pkill` on Windows, and the e2e suite starts
  the CLI with `node --import tsx` rather than `npm`. `composer.json` requires
  `ext-mbstring`. The README has install and update steps for both systems.
- Setup is checked before it installs anything (2026-11-05, found on a real
  Windows 11 machine). `npm run setup` first runs `scripts/check-setup.mjs`,
  which checks Node (same range as `engines`), PHP's patch level (same rule as
  `composer.json`), PHP's extensions and Composer, and stops with a fix for
  each failure. PHP for Windows ships with `pdo_sqlite` off, and the php.ini
  that Composer-Setup.exe writes leaves it off, so `npm run setup:php-ini`
  switches the missing extensions on in the php.ini PHP loads (backup first;
  created from `php.ini-development` if there is none). It never runs as part
  of `setup`, so nothing outside the repo is edited unasked. `zip` is required
  on Windows only: Composer there tries any `7z.exe` on PATH first (often an
  old copy from IT tools, which fails), and `zip` is its only fallback.
  Verified on Windows 11 + PHP 8.5.12 (winget) + Node 26.13 in VS Code's
  PowerShell 5.1: setup, dev, summary, `npm test` and `npm run test:e2e` pass.
  README examples avoid `&&`, which Windows PowerShell 5.1 rejects.

### B14. Definition of done

- [x] Every row in the feature register is implemented, commented with its ID and covered by a test.
- [x] `npm test` passes from a clean clone after `npm run setup`.
- [x] The page totals and the CLI summary agree for at least: all data, 2026-08 (empty), 2026-07 (includes the zero-enquiry return), and a single dealership.
- [x] The README covers every item in B13.
- [x] The git history reads as a clear story of the build.
