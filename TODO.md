# Build checklist: Debonaire dealership reporting

The bible is [`.claude/skills/dealership-spec/SKILL.md`](.claude/skills/dealership-spec/SKILL.md).
IDs like `F4` refer to its feature register (B3), and `B6` etc. refer to its sections.
Tick items off as they land, and keep commits aligned with these steps (B12).

## Phase 0: Setup
- [x] Install toolchain: `brew install php composer` (PHP 8.5, Composer 2.11) with `pdo_sqlite` and `curl` enabled
- [x] `git init`, `.gitignore`, first commit with the bible + this checklist
- [x] Root `package.json` with npm workspaces (`shared`, `cli`, `web`) and the scripts `setup`, `dev`, `seed`, `summary`, `test`
- [x] `api/composer.json` (PSR-4 `Debonaire\Api\` → `src/`, PHPUnit dev dependency), `phpunit.xml` with Unit + Integration suites

## Phase 1: API foundations (PHP)
- [x] `database/schema.sql` exactly as in B6 (UNIQUE, CHECK, FK)
- [x] `Persistence/Database`: PDO, PRAGMAs (FK, WAL, busy_timeout), `transaction()` helper using `BEGIN IMMEDIATE`
- [x] `database/seed.php`: idempotent seed from B6, with `created` audit rows (F1)
- [x] `Http/Request`, `Http/JsonResponse` (error envelope from B7), `Http/Router` (404/405), `Http/Cors` (204 preflight)
- [x] `public/index.php` front controller that wires it all, plus `GET /api/health`
- [x] `Domain/Month` with an injected clock and the Europe/London "current month" rule

## Phase 2: Core spec features (PHP)
- [x] `Domain/ReturnValidator` (F4): every rule in B4, with all errors collected together
- [x] `Domain/ReportCalculator` (F6): totals + canonical integer rate formula
- [x] `fixtures/conversion-cases.json` with rate vectors (F13)
- [x] `GET /api/dealerships`
- [x] `POST /api/returns` (F2) with a 409 on the UNIQUE violation and a useful message (F5)
- [x] `GET /api/returns` with filters + server totals, and `GET /api/returns/{id}` (F3, F6)

## Phase 3: Edge-case features (PHP)
- [x] `Domain/Role`, `Domain/Actor`, `Domain/AccessPolicy` + mock headers + 401/403 (F9)
- [x] Idempotency-Key store and replay (F7)
- [x] `PUT /api/returns/{id}` corrections + `return_audit` in one transaction (F8)
- [x] `GET /api/returns/{id}/audit` (F8)

## Phase 4: PHP test suite
- [x] Unit tests: `ReturnValidatorTest`, `MonthTest`, `ReportCalculatorTest` (incl. fixture vectors), `AccessPolicyTest`
- [x] Integration harness: `php -S` on a free port + temp SQLite, seeded per test
- [x] Integration tests: every bullet in B11 "PHP integration", including the concurrent-duplicate race
- [x] PHP suite green: 169 tests (107 unit, 62 integration). The concurrency tests were stable over 5 repeated runs

## Phase 5: Shared TS package
- [x] API types (`Return`, `Totals`, `AuditEntry`, error envelope) from B7, plus a typed API client
- [x] `conversionBasisPoints()` / `formatRate()` / `formatCount()` (F13)
- [x] Vitest: every fixture vector + formatting

## Phase 6: Node CLI (F12)
- [x] Argument parsing: `--from`, `--to`, `--month`, `--dealership`, `--api`, plus usage text
- [x] Fetch `/api/returns` as manager, print the B8 output, empty-period message
- [x] Cross-check server totals vs recomputed totals, with exit codes 0/1/2/3
- [x] Vitest: arguments, output, empty period, mismatch, API failure

## Phase 7: Next.js web app
- [x] Scaffold App Router + TS. Theme tokens and Open Sans per B9. Original Debonaire bow-tie wordmark
- [x] Layout: red top bar, mock role switcher (F9), 960px container, footer disclaimer
- [x] API client: base URL, mock headers, parses the error envelope
- [x] Submit form (F10): feedback for success / 422 / 409, pending state, idempotency key reused on retry (F7)
- [x] Returns panel (F11): filters, totals tiles from the server, table, loading/empty/error + Retry, refetch after submit
- [x] Manager actions: Correct dialog + History view (F8)
- [x] Vitest + React Testing Library: tests from B11 "web"
- [x] `next build` passes. Checked visually at desktop and 375px widths

## Phase 8: Handover
- [x] README with every section in B13
- [x] Manual check against the real PHP API: page totals and CLI agree for all data, 2026-08, 2026-07, a single dealership, and after a correction (B14)
- [x] Final `npm test` (PHP + TypeScript) green, and a tidy git log

## Phase 9: End-to-end tests (added after handover)
- [x] Playwright config with isolated servers (API :8100, web :3100 in `.next-e2e`) and its own database, reset before each test
- [x] Journeys: submit/refresh, field errors, duplicate, lost-response retry, form bypass, empty and zero-enquiry months, page = CLI, correction + history, dealer scope, failed request + retry
- [x] 11 tests green, stable over repeated runs. README and bible updated
