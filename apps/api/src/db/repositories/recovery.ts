/**
 * Recovery repository - Phase 6
 *
 * 服务于 routes 与 orchestrator 的恢复计划/打卡 CRUD。
 * 所有写操作必须先按 user_id 校验归属。
 */
import type { Pool, PoolClient } from 'pg';
import type {
  RecoveryCheckinDTO,
  RecoveryPlanDTO,
  RecoveryPlanStatus,
  RecoveryPlanType,
} from '@emotion/shared';

interface RecoveryPlanRow {
  id: string;
  user_id: string;
  plan_type: string;
  total_days: number;
  current_day: number;
  status: string;
  payload_json: Record<string, unknown> | null;
  started_at: Date;
  updated_at: Date;
}

interface RecoveryCheckinRow {
  id: string;
  plan_id: string;
  day_index: number;
  completed: boolean;
  reflection: string | null;
  mood_score: number | null;
  created_at: Date;
}

function planToDTO(row: RecoveryPlanRow): RecoveryPlanDTO {
  return {
    id: row.id,
    user_id: row.user_id,
    plan_type: row.plan_type as RecoveryPlanType,
    total_days: row.total_days,
    current_day: row.current_day,
    status: row.status as RecoveryPlanStatus,
    payload_json: row.payload_json ?? {},
    started_at: row.started_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function checkinToDTO(row: RecoveryCheckinRow): RecoveryCheckinDTO {
  return {
    id: row.id,
    plan_id: row.plan_id,
    day_index: row.day_index,
    completed: row.completed,
    reflection: row.reflection,
    mood_score: row.mood_score,
    created_at: row.created_at.toISOString(),
  };
}

const PLAN_TOTAL_DAYS: Record<RecoveryPlanType, number> = {
  '7day-breakup': 7,
  '14day-rumination': 14,
};

export interface CompleteCheckinResult {
  checkin: RecoveryCheckinDTO;
  plan: RecoveryPlanDTO;
}

export interface RecoveryRepository {
  listPlansByUser(userId: string): Promise<RecoveryPlanDTO[]>;
  /** 获取指定 id 的计划，会同时校验 user 归属；不归属返回 null */
  getPlanById(id: string, userId: string): Promise<RecoveryPlanDTO | null>;
  /** 获取该用户当前 active 的计划（最新一条） */
  getActivePlanByUser(userId: string): Promise<RecoveryPlanDTO | null>;
  createPlan(
    userId: string,
    planType: RecoveryPlanType
  ): Promise<RecoveryPlanDTO>;
  updatePlanStatus(
    id: string,
    status: RecoveryPlanStatus
  ): Promise<RecoveryPlanDTO | null>;
  listCheckinsByPlan(planId: string): Promise<RecoveryCheckinDTO[]>;
  /** 获取或创建占位 checkin（completed=false） */
  getOrCreateCheckin(
    planId: string,
    dayIndex: number
  ): Promise<RecoveryCheckinDTO>;
  /**
   * 完成今日打卡。事务内：
   *   1. upsert checkin 为 completed=true，写入 reflection / mood_score
   *   2. plan.current_day += 1
   *   3. 若 current_day > total_days，则 plan.status = 'completed'
   */
  completeCheckin(
    planId: string,
    userId: string,
    dayIndex: number,
    reflection: string | null,
    moodScore: number | null
  ): Promise<CompleteCheckinResult | null>;
}

export function createRecoveryRepository(pool: Pool): RecoveryRepository {
  return {
    async listPlansByUser(userId) {
      const res = await pool.query<RecoveryPlanRow>(
        `SELECT * FROM recovery_plans
         WHERE user_id = $1
         ORDER BY started_at DESC
         LIMIT 100`,
        [userId]
      );
      return res.rows.map(planToDTO);
    },

    async getPlanById(id, userId) {
      const res = await pool.query<RecoveryPlanRow>(
        `SELECT * FROM recovery_plans
         WHERE id = $1 AND user_id = $2
         LIMIT 1`,
        [id, userId]
      );
      const row = res.rows[0];
      return row ? planToDTO(row) : null;
    },

    async getActivePlanByUser(userId) {
      const res = await pool.query<RecoveryPlanRow>(
        `SELECT * FROM recovery_plans
         WHERE user_id = $1 AND status = 'active'
         ORDER BY started_at DESC
         LIMIT 1`,
        [userId]
      );
      const row = res.rows[0];
      return row ? planToDTO(row) : null;
    },

    async createPlan(userId, planType) {
      const totalDays = PLAN_TOTAL_DAYS[planType];
      const res = await pool.query<RecoveryPlanRow>(
        `INSERT INTO recovery_plans
           (user_id, plan_type, total_days, current_day, status)
         VALUES ($1, $2, $3, 1, 'active')
         RETURNING *`,
        [userId, planType, totalDays]
      );
      const row = res.rows[0];
      if (!row) throw new Error('createPlan: insert returned no row');
      return planToDTO(row);
    },

    async updatePlanStatus(id, status) {
      const res = await pool.query<RecoveryPlanRow>(
        `UPDATE recovery_plans SET status = $2 WHERE id = $1 RETURNING *`,
        [id, status]
      );
      const row = res.rows[0];
      return row ? planToDTO(row) : null;
    },

    async listCheckinsByPlan(planId) {
      const res = await pool.query<RecoveryCheckinRow>(
        `SELECT * FROM recovery_checkins
         WHERE plan_id = $1
         ORDER BY day_index ASC`,
        [planId]
      );
      return res.rows.map(checkinToDTO);
    },

    async getOrCreateCheckin(planId, dayIndex) {
      const existing = await pool.query<RecoveryCheckinRow>(
        `SELECT * FROM recovery_checkins
         WHERE plan_id = $1 AND day_index = $2
         LIMIT 1`,
        [planId, dayIndex]
      );
      const row = existing.rows[0];
      if (row) return checkinToDTO(row);

      const inserted = await pool.query<RecoveryCheckinRow>(
        `INSERT INTO recovery_checkins (plan_id, day_index, completed)
         VALUES ($1, $2, FALSE)
         ON CONFLICT (plan_id, day_index) DO UPDATE
           SET day_index = EXCLUDED.day_index
         RETURNING *`,
        [planId, dayIndex]
      );
      const newRow = inserted.rows[0];
      if (!newRow) throw new Error('getOrCreateCheckin: insert returned no row');
      return checkinToDTO(newRow);
    },

    async completeCheckin(planId, userId, dayIndex, reflection, moodScore) {
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');

        // 校验归属并锁住该 plan 行
        const planRes = await client.query<RecoveryPlanRow>(
          `SELECT * FROM recovery_plans
           WHERE id = $1 AND user_id = $2
           FOR UPDATE`,
          [planId, userId]
        );
        const planRow = planRes.rows[0];
        if (!planRow) {
          await client.query('ROLLBACK');
          return null;
        }

        // upsert checkin（同一天再次打卡 = 更新）
        const checkinRes = await client.query<RecoveryCheckinRow>(
          `INSERT INTO recovery_checkins
             (plan_id, day_index, completed, reflection, mood_score)
           VALUES ($1, $2, TRUE, $3, $4)
           ON CONFLICT (plan_id, day_index) DO UPDATE
             SET completed = TRUE,
                 reflection = EXCLUDED.reflection,
                 mood_score = EXCLUDED.mood_score
           RETURNING *`,
          [planId, dayIndex, reflection, moodScore]
        );
        const checkinRow = checkinRes.rows[0];
        if (!checkinRow) {
          await client.query('ROLLBACK');
          throw new Error('completeCheckin: checkin upsert returned no row');
        }

        // 推进 current_day；若超出 total_days，则置 completed
        const nextDay = planRow.current_day + 1;
        const nextStatus =
          nextDay > planRow.total_days ? 'completed' : planRow.status;
        const updatedPlanRes = await client.query<RecoveryPlanRow>(
          `UPDATE recovery_plans
           SET current_day = $2, status = $3
           WHERE id = $1
           RETURNING *`,
          [planId, nextDay, nextStatus]
        );
        const updatedPlanRow = updatedPlanRes.rows[0];
        if (!updatedPlanRow) {
          await client.query('ROLLBACK');
          throw new Error('completeCheckin: plan update returned no row');
        }

        await client.query('COMMIT');
        return {
          checkin: checkinToDTO(checkinRow),
          plan: planToDTO(updatedPlanRow),
        };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
