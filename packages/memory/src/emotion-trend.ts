/**
 * 情绪趋势计算 - Phase 7+
 *
 * 从最近 N 天的 user 消息 intake_result 里读出 emotion_state / risk_level，
 * 计算一个简单的"情绪指数"曲线，给主动关心模块和成长页趋势卡片用。
 *
 * 设计原则：
 *  - 纯数据，不下结论。direction 仅说"在好转 / 平稳 / 在低落"，不写"你是抑郁"
 *  - 数据点 < 3 时返回 null，避免误判刚来的用户
 *  - 不依赖 AI，只是简单的算术：可重复、可测试、可解释
 */
import type { Pool } from 'pg';

/** emotion_state → 情绪指数（1=最差, 10=最好） */
const EMOTION_SCORE: Record<string, number> = {
  desperate: 1,
  numb: 2,
  sad: 3,
  lonely: 3,
  angry: 4,
  anxious: 4,
  confused: 5,
  mixed: 5,
};

/** 高风险扣分：high/critical 各 -1，最低不低于 1 */
const RISK_PENALTY: Record<string, number> = {
  low: 0,
  medium: 0,
  high: 1,
  critical: 1,
};

export interface EmotionDataPoint {
  emotion_state: string;
  risk_level: string;
  created_at: string;
}

export interface EmotionTrend {
  /** 平均情绪指数（1-10），保留一位小数 */
  average_score: number;
  /** 趋势方向：与时间轴前半段相比 */
  direction: 'improving' | 'stable' | 'declining';
  /** 从最新一天往前数，连续低分（score<=3）天数 */
  consecutive_low_days: number;
  /** 低分消息（score<=4）出现频率最高的 0-2 个小时 */
  peak_hours: number[];
  /** 出现次数最多的 emotion_state */
  dominant_emotion: string;
  /** 各 emotion_state 出现次数 */
  mention_count: Record<string, number>;
  /** 用于趋势计算的有效数据点数 */
  data_points: number;
}

interface IntakeRow {
  intake_result: { emotion_state?: string } | null;
  risk_level: string | null;
  created_at: Date;
}

/**
 * 把单条消息记录折算成 1-10 的情绪指数。
 * 未知 emotion_state 视为 5（中性）。
 */
export function scoreOf(point: {
  emotion_state: string;
  risk_level: string;
}): number {
  const base = EMOTION_SCORE[point.emotion_state] ?? 5;
  const penalty = RISK_PENALTY[point.risk_level] ?? 0;
  return Math.max(1, base - penalty);
}

/**
 * 计算趋势。导出供测试单独调用，不依赖 DB。
 */
export function computeTrend(points: EmotionDataPoint[]): EmotionTrend | null {
  if (points.length < 3) return null;

  // 按 created_at 升序排（旧 → 新），方便前后两半切分
  const sorted = [...points].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );

  const scores = sorted.map(scoreOf);
  const sum = scores.reduce((a, b) => a + b, 0);
  const average_score = Math.round((sum / scores.length) * 10) / 10;

  // direction：前后两半均值差值 > 0.5 才认为有趋势
  const mid = Math.floor(scores.length / 2);
  const firstHalf = scores.slice(0, mid);
  const secondHalf = scores.slice(mid);
  const avg = (arr: number[]): number =>
    arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);
  let direction: EmotionTrend['direction'];
  if (secondAvg > firstAvg + 0.5) direction = 'improving';
  else if (secondAvg < firstAvg - 0.5) direction = 'declining';
  else direction = 'stable';

  // consecutive_low_days：从最新一天往前数，连续低分（score<=3）天数
  // 同一天可能有多条消息，按 YYYY-MM-DD 分组取均值
  const byDay = new Map<string, number[]>();
  for (let i = 0; i < sorted.length; i++) {
    const day = sorted[i]!.created_at.slice(0, 10);
    const arr = byDay.get(day) ?? [];
    arr.push(scores[i]!);
    byDay.set(day, arr);
  }
  const sortedDays = [...byDay.keys()].sort(); // 升序
  let consecutive_low_days = 0;
  for (let i = sortedDays.length - 1; i >= 0; i--) {
    const day = sortedDays[i]!;
    const dayScores = byDay.get(day)!;
    const dayAvg = dayScores.reduce((a, b) => a + b, 0) / dayScores.length;
    if (dayAvg <= 3) consecutive_low_days++;
    else break;
  }

  // peak_hours：低分消息（score<=4）频率最高的 0-2 个小时
  const hourCount = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    if (scores[i]! > 4) continue;
    const date = new Date(sorted[i]!.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const h = date.getHours();
    hourCount.set(h, (hourCount.get(h) ?? 0) + 1);
  }
  const peak_hours = [...hourCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([h]) => h);

  // dominant_emotion + mention_count
  const mention_count: Record<string, number> = {};
  for (const p of sorted) {
    mention_count[p.emotion_state] = (mention_count[p.emotion_state] ?? 0) + 1;
  }
  const dominant_emotion =
    Object.entries(mention_count).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    'mixed';

  return {
    average_score,
    direction,
    consecutive_low_days,
    peak_hours,
    dominant_emotion,
    mention_count,
    data_points: sorted.length,
  };
}

/**
 * 从 DB 拉最近 N 天的 user 消息 intake，算趋势。
 * 数据不足返回 null（外层应展示「继续聊几次就能看出来」之类的占位）。
 */
export async function getEmotionTrend(
  pool: Pool,
  userId: string,
  days = 7
): Promise<EmotionTrend | null> {
  const safeDays = Math.max(1, Math.min(days, 90));
  // 注意：messages 和 sessions 都有 created_at 列，SELECT 必须给 m.created_at
  // 加表前缀，否则 PostgreSQL 抛 "column reference 'created_at' is ambiguous"
  const res = await pool.query<IntakeRow>(
    `SELECT m.intake_result, m.risk_level, m.created_at
     FROM messages m
     JOIN sessions s ON s.id = m.session_id
     WHERE s.user_id = $1
       AND m.role = 'user'
       AND m.intake_result IS NOT NULL
       AND m.created_at >= NOW() - ($2::int * INTERVAL '1 day')
     ORDER BY m.created_at ASC`,
    [userId, safeDays]
  );

  const points: EmotionDataPoint[] = [];
  for (const row of res.rows) {
    const emotion_state = row.intake_result?.emotion_state;
    if (typeof emotion_state !== 'string' || emotion_state.length === 0) {
      continue;
    }
    points.push({
      emotion_state,
      risk_level: row.risk_level ?? 'low',
      created_at: row.created_at.toISOString(),
    });
  }

  return computeTrend(points);
}
