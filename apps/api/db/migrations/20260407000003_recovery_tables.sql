-- Phase 6: recovery plans subsystem
-- CLAUDE.md §10 / §18 (Phase 6)
-- 复用 20260407000001 中定义的 set_updated_at() trigger function

-- ============================================================
-- recovery_plans
-- 用户恢复计划：7 天分手恢复 / 14 天反内耗
-- ============================================================
CREATE TABLE IF NOT EXISTS recovery_plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_type    VARCHAR(32) NOT NULL,
  total_days   INT NOT NULL,
  current_day  INT NOT NULL DEFAULT 1,
  status       VARCHAR(16) NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'paused', 'completed')),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_plans_user
  ON recovery_plans(user_id, status);

DROP TRIGGER IF EXISTS recovery_plans_set_updated_at ON recovery_plans;
CREATE TRIGGER recovery_plans_set_updated_at
  BEFORE UPDATE ON recovery_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- recovery_checkins
-- 每日打卡：每个 plan 的每个 day_index 唯一
-- ============================================================
CREATE TABLE IF NOT EXISTS recovery_checkins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID NOT NULL REFERENCES recovery_plans(id) ON DELETE CASCADE,
  day_index   INT NOT NULL,
  completed   BOOLEAN NOT NULL DEFAULT FALSE,
  reflection  TEXT,
  mood_score  INT CHECK (mood_score BETWEEN 1 AND 10),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, day_index)
);

CREATE INDEX IF NOT EXISTS idx_recovery_checkins_plan
  ON recovery_checkins(plan_id, day_index);
