-- Debonaire dealership returns: SQLite schema.
--
-- The constraints below deliberately repeat the rules enforced by
-- ReturnValidator (defence in depth). Even if a bug slipped past the PHP
-- validation, the database itself refuses duplicate returns, negative or
-- non-integer counts, and sales greater than enquiries.
--
-- Every statement is idempotent (IF NOT EXISTS) so the API can run this on boot.

-- F1: fictional dealerships.
CREATE TABLE IF NOT EXISTS dealerships (
    id   TEXT PRIMARY KEY,               -- short code, e.g. 'NGM'
    name TEXT NOT NULL UNIQUE
);

-- F2/F3: one monthly return per dealership.
CREATE TABLE IF NOT EXISTS returns (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    dealership_id TEXT    NOT NULL REFERENCES dealerships (id),
    month         TEXT    NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'),
    enquiries     INTEGER NOT NULL CHECK (typeof(enquiries) = 'integer' AND enquiries >= 0),
    sales         INTEGER NOT NULL CHECK (typeof(sales) = 'integer' AND sales >= 0 AND sales <= enquiries),
    created_at    TEXT    NOT NULL,      -- ISO-8601 UTC
    updated_at    TEXT    NOT NULL,
    -- F5: the database, not just the app, guarantees one return per dealership
    -- per month, so two concurrent requests can never both succeed.
    UNIQUE (dealership_id, month)
);

-- F3: period filters scan by month.
CREATE INDEX IF NOT EXISTS returns_month_idx ON returns (month);

-- F8: append-only history of every create and correction.
CREATE TABLE IF NOT EXISTS return_audit (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id           INTEGER NOT NULL REFERENCES returns (id),
    action              TEXT    NOT NULL CHECK (action IN ('created', 'corrected')),
    actor_role          TEXT    NOT NULL,  -- 'dealer', 'manager' or 'seed'
    actor_dealership_id TEXT,
    before_json         TEXT,              -- NULL for 'created'
    after_json          TEXT    NOT NULL,
    reason              TEXT,              -- required (by the app) for 'corrected'
    created_at          TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS return_audit_return_idx ON return_audit (return_id);

-- F7: remembers which return each Idempotency-Key created, so a retried
-- request (e.g. after a lost response) replays the original success.
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key          TEXT PRIMARY KEY,
    request_hash TEXT    NOT NULL,         -- sha256 of actor + canonical payload
    return_id    INTEGER NOT NULL REFERENCES returns (id),
    created_at   TEXT    NOT NULL
);
