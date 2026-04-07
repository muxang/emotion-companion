-- Phase 7：埋点事件表
-- 记录关键业务事件（对话、分析、恢复计划、安全触发、记忆删除等）。
-- 仅存聚合/行为类指标，禁止写入用户原始脆弱表达（CLAUDE.md §14.2）。

CREATE TABLE IF NOT EXISTS analytics_events (
  id            BIGSERIAL PRIMARY KEY,
  event_name    VARCHAR(64)  NOT NULL,
  user_id       UUID         REFERENCES users(id) ON DELETE SET NULL,
  properties    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created
  ON analytics_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created
  ON analytics_events (user_id, created_at DESC);
