# Build checklist: Debonaire dealership reporting

The bible is [`.claude/skills/dealership-spec/SKILL.md`](.claude/skills/dealership-spec/SKILL.md).
IDs like `F4` refer to its feature register (B3), and `B6` etc. refer to its sections.
Tick items off as they land, and keep commits aligned with these steps (B12).

## Phase 0: Setup
- [ ] Install toolchain: `brew install php composer` and confirm `pdo_sqlite` is enabled
- [x] `git init`, `.gitignore`, first commit with the bible + this checklist
- [ ] Root `package.json` with npm workspaces (`shared`, `cli`, `web`) and the scripts `setup`, `dev`, `seed`, `summary`, `test`
- [ ] `api/composer.json` (PSR-4 `Debonaire\Api\` → `src/`, PHPUnit dev dependency), `phpunit.xml` with Unit + Integration suites

## Phase 1: API foundations (PHP)
- [ ] `database/schema.sql` exactly as in B6 (UNIQUE, CHECK, FK)
- [ ] `Persistence/Database`: PDO, PRAGMAs (FK, WAL, busy_timeout), `transaction()` helper using `BEGIN IMMEDIATE`
- [ ] `database/seed.php`: idempotent seed from B6, with `created` audit rows (F1)
- [ ] `Http/Request`, `Http/JsonResponse` (error envelope from B7), `Http/Router` (404/405), `Http/Cors` (204 preflight)
- [ ] `public/index.php` front controller that wires it all, plus `GET /api/health`
- [ ] `Domain/Month` with an injected clock and the Europe/London "current month" rule

## Phase 2: Core spec features (PHP)
- [ ] `Domain/ReturnValidator` (F4): every rule in B4, with all errors collected together
- [ ] `Domain/ReportCalculator` (F6): totals + canonical integer rate formula
- [ ] `fixtures/conversion-cases.json` with rate vectors (F13)
- [ ] `GET /api/dealerships`
- [ ] `POST /api/returns` (F2) with a 409 on the UNIQUE violation and a useful message (F5)
- [ ] `GET /api/returns` with filters + server totals, and `GET /api/returns/{id}` (F3, F6)

## Phase 3: Edge-case features (PHP)
- [ ] `Domain/Role`, `Domain/Actor`, `Domain/AccessPolicy` + mock headers + 401/403 (F9)
- [ ] Idempotency-Key store and replay (F7)
- [ ] `PUT /api/returns/{id}` corrections + `return_audit` in one transaction (F8)
- [ ] `GET /api/returns/{id}/audit` (F8)

## Phase 4: PHP test suite
- [ ] Unit tests: `ReturnValidatorTest`, `MonthTest`, `ReportCalculatorTest` (incl. fixture vectors), `AccessPolicyTest`
- [ ] Integration harness: `php -S` on a free port + temp SQLite, seeded per class
- [ ] Integration tests: every bullet in B11 "PHP integration", including the concurrent-duplicate race

## Phase 5: Shared TS package
- [ ] API types (`Return`, `Totals`, `AuditEntry`, error envelope) from B7
- [ ] `conversionBasisPoints()` / `formatRate()` / `formatCount()` (F13)
- [ ] Vitest: every fixture vector + formatting

## Phase 6: Node CLI (F12)
- [ ] Argument parsing: `--from`, `--to`, `--month`, `--dealership`, `--api`, plus usage text
- [ ] Fetch `/api/returns` as manager, print the B8 output, empty-period message
- [ ] Cross-check server totals vs recomputed totals, with exit codes 0/1/2/3
- [ ] Vitest: arguments, output, empty period, mismatch, API failure

## Phase 7: Next.js web app
- [ ] Scaffold App Router + TS. Theme tokens and Open Sans per B9. Original Debonaire bow-tie wordmark
- [ ] Layout: red top bar, mock role switcher (F9), 960px container, footer disclaimer
- [ ] API client: base URL, mock headers, parses the error envelope
- [ ] Submit form (F10): feedback for success / 422 / 409, pending state, idempotency key reused on retry (F7)
- [ ] Returns panel (F11): filters, totals tiles from the server, table, loading/empty/error + Retry, refetch after submit
- [ ] Manager actions: Correct dialog + History view (F8)
- [ ] Vitest + React Testing Library: tests from B11 "web"

## Phase 8: Handover
- [ ] README with every section in B13
- [ ] Manual check: page totals and CLI agree for all data, 2026-08, 2026-07, and a single dealership (B14)
- [ ] Final `npm test` from a clean setup, and a tidy git log
