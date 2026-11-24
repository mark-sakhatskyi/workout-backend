-- Compatibility-first PostgreSQL schema. Legacy identifiers are preserved as text.
CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    email text NOT NULL UNIQUE,
    password_hash text,
    google_id text UNIQUE,
    token_version integer NOT NULL DEFAULT 0 CHECK (token_version >= 0),
    profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(profile) = 'object')
);
CREATE TABLE IF NOT EXISTS body_metrics (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    measured_at timestamptz NOT NULL,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX IF NOT EXISTS body_metrics_user_date ON body_metrics(user_id, measured_at DESC, id);
CREATE TABLE IF NOT EXISTS goals (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);
-- Stable relational keys and dates; JSONB preserves all existing domain fields
-- during migration. Normalize additional fields only after verifying legacy data.
CREATE TABLE IF NOT EXISTS workouts (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day date NOT NULL, payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);
CREATE TABLE IF NOT EXISTS meals (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day date NOT NULL, payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);
CREATE TABLE IF NOT EXISTS cardio (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day date NOT NULL, payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);
CREATE TABLE IF NOT EXISTS comments (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day date NOT NULL, payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);
CREATE TABLE IF NOT EXISTS news (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day date NOT NULL, payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX IF NOT EXISTS workouts_user_date ON workouts(user_id, day DESC, id);
CREATE INDEX IF NOT EXISTS meals_user_date ON meals(user_id, day DESC, id);
CREATE INDEX IF NOT EXISTS cardio_user_date ON cardio(user_id, day DESC, id);
CREATE INDEX IF NOT EXISTS comments_user_date ON comments(user_id, day DESC, id);
CREATE INDEX IF NOT EXISTS news_user_date ON news(user_id, day DESC, id);
CREATE TABLE IF NOT EXISTS migration_runs (
    name text PRIMARY KEY, completed_at timestamptz NOT NULL DEFAULT now(), counts jsonb NOT NULL
);
