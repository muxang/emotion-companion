-- Phase 1 init: users / sessions / messages
-- CLAUDE.md §10

-- pgcrypto for gen_random_uuid (Supabase 默认启用)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- shared updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id    TEXT UNIQUE NOT NULL,
  email           TEXT,
  open_id         TEXT,
  nickname        TEXT,
  tone_preference TEXT NOT NULL DEFAULT 'warm'
                  CHECK (tone_preference IN ('warm', 'rational', 'direct')),
  memory_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_anonymous_id ON users(anonymous_id);

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT '新对话',
  mode          TEXT NOT NULL DEFAULT 'companion'
                CHECK (mode IN ('companion', 'analysis', 'coach', 'recovery', 'safety')),
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_created
  ON sessions(user_id, created_at DESC);

DROP TRIGGER IF EXISTS sessions_set_updated_at ON sessions;
CREATE TRIGGER sessions_set_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- messages
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  structured_json JSONB,
  intake_result   JSONB,
  risk_level      TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session_created
  ON messages(session_id, created_at);
