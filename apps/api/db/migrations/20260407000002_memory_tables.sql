-- Phase 5: memory subsystem tables
-- CLAUDE.md §10 / §14
-- 复用 20260407000001 中定义的 set_updated_at() trigger function

-- ============================================================
-- user_profiles
-- 用户长期画像（依恋风格 / 边界偏好 / 触发点）
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  traits_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachment_style     VARCHAR(32),
  boundary_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  common_triggers      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS user_profiles_set_updated_at ON user_profiles;
CREATE TRIGGER user_profiles_set_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- relationship_entities
-- 用户关系对象（前任 / 现任 / 暧昧 / 朋友）
-- ============================================================
CREATE TABLE IF NOT EXISTS relationship_entities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         VARCHAR(64) NOT NULL,
  relation_type VARCHAR(32),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relationship_entities_user
  ON relationship_entities(user_id);

DROP TRIGGER IF EXISTS relationship_entities_set_updated_at ON relationship_entities;
CREATE TRIGGER relationship_entities_set_updated_at
  BEFORE UPDATE ON relationship_entities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- relationship_events
-- 关键关系事件（分手 / 复合 / 冷战 / 失联）
-- ============================================================
CREATE TABLE IF NOT EXISTS relationship_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id      UUID REFERENCES relationship_entities(id) ON DELETE SET NULL,
  event_type     VARCHAR(64) NOT NULL,
  event_time     TIMESTAMPTZ,
  summary        TEXT NOT NULL,
  evidence_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relationship_events_user
  ON relationship_events(user_id, event_time DESC);

-- ============================================================
-- memory_summaries
-- 会话/周/实体维度的提炼摘要（100~200 字）
-- 不存原始脆弱表达；MVP 不引入 pgvector
-- ============================================================
CREATE TABLE IF NOT EXISTS memory_summaries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id   UUID REFERENCES sessions(id) ON DELETE SET NULL,
  summary_type VARCHAR(32) NOT NULL
               CHECK (summary_type IN ('session', 'weekly', 'entity')),
  summary_text TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_summaries_user
  ON memory_summaries(user_id, summary_type, created_at DESC);
