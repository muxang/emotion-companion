/**
 * AI 见证人系统 - Phase 7+
 *
 * 核心理念：不是鼓励，是见证。
 * 在特定时刻（里程碑、关系变化、情绪转折...），
 * 用 AI 基于用户真实数据生成一句独一无二的"见证"。
 *
 * 三层架构：
 *  1. collectWitnessData — 收集用户真实数据（DB 查询）
 *  2. detectWitnessType  — 纯规则触发检测（不调 AI）
 *  3. generateWitnessMessage — AI 生成见证文案（5s 超时，失败静默跳过）
 */
import type { Pool } from 'pg';
import type { AIClient } from '@emotion/core-ai';
import type { EmotionTrend } from './emotion-trend.js';
import { computeTrend, type EmotionDataPoint } from './emotion-trend.js';

// ============================================================
// 类型定义
// ============================================================

export type WitnessType =
  | 'first_return'
  | 'milestone_5'
  | 'milestone_15'
  | 'milestone_30'
  | 'question_shift'
  | 'entity_fade'
  | 'emotion_turn'
  | 'late_night_persist'
  | 'after_silence'
  | 'plan_persist'
  | 'self_focus_shift'
  | 'decision_made';

export interface WitnessRawData {
  totalSessions: number;
  totalMessages: number;
  firstMessageAt: string | null;
  lastMessageBeforeToday: string | null;
  currentHour: number;
  currentRiskLevel: string;

  earliestMessages: string[];
  recentMessages: string[];
  firstMessage: string | null;

  dominantEntityLabel: string | null;
  dominantEntityRecent: number;
  dominantEntityEarlier: number;

  emotionTrend: EmotionTrend | null;
  previousConsecutiveLowDays: number;

  hasActivePlan: boolean;
  planType: string | null;
  planCurrentDay: number;
  planTotalDays: number;
  recentCheckins: number;

  todayAlreadyWitnessed: boolean;
  lastWitnessType: string | null;
}

export interface WitnessDetection {
  shouldWitness: boolean;
  witness_type: WitnessType | null;
  trigger_evidence: Record<string, unknown>;
}

const NO_WITNESS: WitnessDetection = {
  shouldWitness: false,
  witness_type: null,
  trigger_evidence: {},
};

// ============================================================
// 1. 数据收集层
// ============================================================

export async function collectWitnessData(
  pool: Pool,
  userId: string,
  currentRiskLevel: string,
  /** 当前这条用户消息（还没写入 DB），prepend 到 recentMessages 最前面 */
  currentUserText?: string
): Promise<WitnessRawData> {
  const now = new Date();
  // 服务器可能跑在 UTC 时区（VPS / Supabase），用 UTC+8 换算北京时间
  const beijingHour = (now.getUTCHours() + 8) % 24;

  // 用单个连接串行执行所有查询，避免 11 个 query 各占一个连接打满 Pool。
  // 单连接上串行 SQL 足够快（每条 <10ms），总耗时 ~50-100ms 完全可接受。
  const client = await pool.connect();
  try {
    const sessionCountRes = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM sessions WHERE user_id = $1`,
      [userId]
    );
    const messageCountRes = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE s.user_id = $1 AND m.role = 'user'`,
      [userId]
    );
    const firstMsgRes = await client.query<{ content: string; created_at: Date }>(
      `SELECT m.content, m.created_at FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE s.user_id = $1 AND m.role = 'user'
       ORDER BY m.created_at ASC LIMIT 1`,
      [userId]
    );
    const lastMsgBeforeTodayRes = await client.query<{ created_at: Date }>(
      `SELECT m.created_at FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE s.user_id = $1 AND m.role = 'user'
         AND m.created_at < date_trunc('day', NOW())
       ORDER BY m.created_at DESC LIMIT 1`,
      [userId]
    );
    const earliestMsgsRes = await client.query<{ content: string }>(
      `SELECT m.content FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE s.user_id = $1 AND m.role = 'user'
       ORDER BY m.created_at ASC LIMIT 5`,
      [userId]
    );
    const recentMsgsRes = await client.query<{ content: string }>(
      `SELECT m.content FROM (
         SELECT m2.content, m2.created_at FROM messages m2
         JOIN sessions s ON s.id = m2.session_id
         WHERE s.user_id = $1 AND m2.role = 'user'
         ORDER BY m2.created_at DESC LIMIT 10
       ) m ORDER BY m.created_at ASC`,
      [userId]
    );
    const entityStatsRes = await client.query<{ label: string }>(
      `SELECT label FROM relationship_entities
       WHERE user_id = $1
       ORDER BY updated_at DESC LIMIT 1`,
      [userId]
    );
    const planRes = await client.query<{ plan_type: string; current_day: number; total_days: number }>(
      `SELECT plan_type, current_day, total_days FROM recovery_plans
       WHERE user_id = $1 AND status = 'active'
       ORDER BY started_at DESC LIMIT 1`,
      [userId]
    );
    const checkinCountRes = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM recovery_checkins rc
       JOIN recovery_plans rp ON rp.id = rc.plan_id
       WHERE rp.user_id = $1 AND rc.completed = true
         AND rc.created_at >= NOW() - INTERVAL '14 days'`,
      [userId]
    );
    // 用 Asia/Shanghai 时区判断"北京时间的今天"，避免 UTC 日期偏移
    const todayWitnessRes = await client.query<{ exists: boolean; witness_type: string | null }>(
      `SELECT EXISTS (
         SELECT 1 FROM messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE s.user_id = $1 AND m.role = 'assistant'
           AND m.structured_json ? '_witness_type'
           AND m.created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
       ) AS exists,
       (SELECT m.structured_json->>'_witness_type' FROM messages m
        JOIN sessions s ON s.id = m.session_id
        WHERE s.user_id = $1 AND m.role = 'assistant'
          AND m.structured_json ? '_witness_type'
        ORDER BY m.created_at DESC LIMIT 1
       ) AS witness_type`,
      [userId]
    );
    const emotionPointsRes = await client.query<{ emotion_state: string; risk_level: string | null; created_at: Date }>(
      `SELECT m.intake_result->>'emotion_state' AS emotion_state,
              m.risk_level, m.created_at
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE s.user_id = $1 AND m.role = 'user'
         AND m.intake_result IS NOT NULL
         AND m.created_at >= NOW() - INTERVAL '14 days'
       ORDER BY m.created_at ASC`,
      [userId]
    );

  const earliestMessages = earliestMsgsRes.rows.map((r) => r.content);
  // 当前消息还没写入 DB，手动 prepend 保证关键词匹配能命中
  const dbRecentMessages = recentMsgsRes.rows.map((r) => r.content);
  const recentMessages = currentUserText
    ? [currentUserText, ...dbRecentMessages]
    : dbRecentMessages;
  const dominantLabel = entityStatsRes.rows[0]?.label ?? null;

  // 计算实体在早期/近期消息中的出现次数
  let dominantEntityEarlier = 0;
  let dominantEntityRecent = 0;
  if (dominantLabel) {
    for (const msg of earliestMessages) {
      if (msg.includes(dominantLabel)) dominantEntityEarlier++;
    }
    for (const msg of recentMessages.slice(0, 5)) {
      if (msg.includes(dominantLabel)) dominantEntityRecent++;
    }
  }

  // 计算情绪趋势
  const emotionPoints: EmotionDataPoint[] = emotionPointsRes.rows
    .filter((r) => r.emotion_state)
    .map((r) => ({
      emotion_state: r.emotion_state,
      risk_level: r.risk_level ?? 'low',
      created_at: r.created_at.toISOString(),
    }));
  const emotionTrend = computeTrend(emotionPoints);

  // 上次连续低落天数（用前7天数据算）
  const olderPoints = emotionPoints.filter((p) => {
    const d = new Date(p.created_at);
    return d.getTime() < now.getTime() - 3 * 24 * 60 * 60 * 1000;
  });
  const olderTrend = computeTrend(olderPoints);
  const previousConsecutiveLowDays = olderTrend?.consecutive_low_days ?? 0;

  const activePlan = planRes.rows[0];

  return {
    totalSessions: Number(sessionCountRes.rows[0]?.count ?? '0'),
    totalMessages: Number(messageCountRes.rows[0]?.count ?? '0'),
    firstMessageAt: firstMsgRes.rows[0]?.created_at?.toISOString() ?? null,
    lastMessageBeforeToday:
      lastMsgBeforeTodayRes.rows[0]?.created_at?.toISOString() ?? null,
    currentHour: beijingHour,
    currentRiskLevel,

    earliestMessages,
    recentMessages,
    firstMessage: firstMsgRes.rows[0]?.content ?? null,

    dominantEntityLabel: dominantLabel,
    dominantEntityRecent,
    dominantEntityEarlier,

    emotionTrend,
    previousConsecutiveLowDays,

    hasActivePlan: activePlan !== undefined,
    planType: activePlan?.plan_type ?? null,
    planCurrentDay: activePlan?.current_day ?? 0,
    planTotalDays: activePlan?.total_days ?? 0,
    recentCheckins: Number(checkinCountRes.rows[0]?.count ?? '0'),

    todayAlreadyWitnessed: todayWitnessRes.rows[0]?.exists === true,
    lastWitnessType: todayWitnessRes.rows[0]?.witness_type ?? null,
  };
  } finally {
    client.release();
  }
}

// ============================================================
// 2. 触发检测层（纯规则）
// ============================================================

function daysBetween(from: string | null, to: Date): number {
  if (!from) return 0;
  const f = new Date(from);
  if (Number.isNaN(f.getTime())) return 0;
  return Math.floor((to.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
}

export function detectWitnessType(data: WitnessRawData): WitnessDetection {
  // 绝对不触发
  if (data.todayAlreadyWitnessed) return NO_WITNESS;
  if (data.currentRiskLevel === 'high' || data.currentRiskLevel === 'critical')
    return NO_WITNESS;
  // totalSessions < 1 → 无数据，跳过。
  // 注意：不再要求 >= 2，让 decision_made 在首次对话也能触发。
  // 需要最低会话数的类型（entity_fade >= 8, after_silence >= 3 等）在各自条件里限制。
  if (data.totalSessions < 1) return NO_WITNESS;

  const now = new Date();

  interface Check {
    type: WitnessType;
    condition: boolean;
    evidence: Record<string, unknown>;
  }

  const checks: Check[] = [
    // 优先级1：里程碑
    {
      type: 'milestone_30',
      condition: data.totalSessions === 30,
      evidence: {
        totalSessions: 30,
        firstMessageAt: data.firstMessageAt,
        totalMessages: data.totalMessages,
      },
    },
    {
      type: 'milestone_15',
      condition: data.totalSessions === 15,
      evidence: {
        totalSessions: 15,
        firstMessage: data.firstMessage,
        recentMessages: data.recentMessages.slice(0, 3),
      },
    },
    {
      type: 'milestone_5',
      condition: data.totalSessions === 5,
      evidence: {
        totalSessions: 5,
        direction: data.emotionTrend?.direction ?? null,
      },
    },

    // 优先级2：关系变化
    {
      type: 'entity_fade',
      condition:
        data.dominantEntityLabel !== null &&
        data.dominantEntityEarlier >= 3 &&
        data.dominantEntityRecent === 0 &&
        data.totalSessions >= 8,
      evidence: {
        entityLabel: data.dominantEntityLabel,
        earlierCount: data.dominantEntityEarlier,
        recentCount: 0,
      },
    },
    {
      type: 'decision_made',
      condition: data.recentMessages
        .slice(0, 2)
        .some((m) =>
          /我决定|我要|我打算|我不会再|从今天起|我选择/.test(m)
        ),
      evidence: {
        decisionMessage:
          data.recentMessages.find((m) =>
            /我决定|我要|我打算|我不会再|从今天起|我选择/.test(m)
          ) ?? null,
      },
    },

    // 优先级3：模式转变
    {
      type: 'question_shift',
      condition: (() => {
        const early = data.earliestMessages.join('');
        const recent = data.recentMessages.slice(0, 5).join('');
        const earlyHe = (
          early.match(/他为什么|他是不是|他有没有|他怎么/g) || []
        ).length;
        const recentSelf = (
          recent.match(/我想|我需要|我要|我应该|我值得/g) || []
        ).length;
        return earlyHe >= 2 && recentSelf >= 2;
      })(),
      evidence: {
        earlyFocus: 'other',
        recentFocus: 'self',
        earlyMessages: data.earliestMessages.slice(0, 2),
        recentMessages: data.recentMessages.slice(0, 2),
      },
    },
    {
      type: 'self_focus_shift',
      condition: (() => {
        const early = data.earliestMessages.join('');
        const recent = data.recentMessages.slice(0, 5).join('');
        const earlyHe = (early.match(/他|她/g) || []).length;
        const recentHe = (recent.match(/他|她/g) || []).length;
        const earlyI = (early.match(/我/g) || []).length;
        const recentI = (recent.match(/我/g) || []).length;
        return (
          earlyHe > 0 &&
          earlyI > 0 &&
          recentHe < earlyHe * 0.5 &&
          recentI > earlyI * 1.3
        );
      })(),
      evidence: {
        earlyMessages: data.earliestMessages.slice(0, 3),
        recentMessages: data.recentMessages.slice(0, 3),
      },
    },

    // 优先级4：情绪变化
    {
      type: 'emotion_turn',
      condition:
        data.emotionTrend?.direction === 'improving' &&
        data.previousConsecutiveLowDays >= 3 &&
        data.emotionTrend.consecutive_low_days === 0,
      evidence: {
        previousLowDays: data.previousConsecutiveLowDays,
        currentDirection: 'improving',
        recentMessage: data.recentMessages[0] ?? null,
      },
    },

    // 优先级5：时间相关
    {
      type: 'after_silence',
      condition: (() => {
        if (!data.lastMessageBeforeToday) return false;
        const d = daysBetween(data.lastMessageBeforeToday, now);
        return d >= 7 && data.totalSessions >= 3;
      })(),
      evidence: {
        silenceDays: daysBetween(data.lastMessageBeforeToday, now),
        firstMessage: data.firstMessage,
      },
    },
    {
      type: 'first_return',
      // 第2条消息（无论是否同 session）：DB 里有 1 条历史 + 当前这条 = 总消息 2
      // totalSessions === 2 太严格（同 session 内第 2 条不算），改用 totalMessages
      condition:
        data.totalMessages >= 1 &&
        data.totalMessages <= 2 &&
        data.firstMessage !== null,
      evidence: {
        firstMessage: data.firstMessage,
        daysSinceFirst: daysBetween(data.firstMessageAt, now),
      },
    },

    // 优先级6：计划相关
    {
      type: 'plan_persist',
      condition:
        data.hasActivePlan &&
        [3, 7, 14].includes(data.planCurrentDay),
      evidence: {
        currentDay: data.planCurrentDay,
        totalDays: data.planTotalDays,
        planType: data.planType,
        recentCheckins: data.recentCheckins,
      },
    },

    // 优先级7：最低
    {
      type: 'late_night_persist',
      condition:
        (data.currentHour >= 23 || data.currentHour <= 3) &&
        data.totalMessages >= 1,
      evidence: {
        currentHour: data.currentHour,
        recentMessage: data.recentMessages[0] ?? null,
      },
    },
  ];

  for (const check of checks) {
    if (check.condition) {
      return {
        shouldWitness: true,
        witness_type: check.type,
        trigger_evidence: check.evidence,
      };
    }
  }
  return NO_WITNESS;
}

// ============================================================
// 3. AI 生成层
// ============================================================

const WITNESS_BASE_SYSTEM = `你是一个陪伴者，不是咨询师，不是老师，不是 AI 助手。
你刚刚注意到了一些事情，你想说一句话。

说话的原则：
- 只陈述你观察到的事实，不解释，不评价，不给建议
- 字数控制在60-120字之间，说完就退
- 不用感叹号，不用"太棒了""非常"这类词
- 如果有对方的名字或称呼，可以用，让它具体
- 说完之后，留白。不要追问，不要引导，不要结尾语
- 语气像一个老朋友在说一句真心话，不急迫，不热情过度
- 禁止出现：加油、棒、很好、你真的、了不起、骄傲
- 禁止出现任何 emoji 符号
- 这不是鼓励，是见证。这两件事不一样。
- 直接输出见证内容，不要任何前缀如"作为见证者"。`;

const TYPE_PROMPTS: Record<
  WitnessType,
  {
    systemSuffix: string;
    buildUserPrompt: (evidence: Record<string, unknown>, data: WitnessRawData) => string;
  }
> = {
  first_return: {
    systemSuffix: `你注意到：这个人第一次来时说了一些话，今天他们回来了。你想说的是：你记得他们来过，你记得他们第一次说了什么，你看见他们回来了。不要分析他们为什么回来，不要问他们怎么样了，只是说出你注意到的事实。`,
    buildUserPrompt: (ev) =>
      `这个人第一次来是${ev.daysSinceFirst ?? '?'}天前。\n他们第一次说的话是："${ev.firstMessage ?? ''}"\n\n今天他们回来了。\n\n请你说一句话。`,
  },

  milestone_5: {
    systemSuffix: `你注意到：这个人来到这里已经5次了。你想说的是：你记录了这5次，你看见了他们一直在来。`,
    buildUserPrompt: (ev, data) =>
      `这个人来了5次。${data.emotionTrend?.direction === 'improving' ? '情绪走向在慢慢好转。' : ''}\n\n请你说一句话。`,
  },

  milestone_15: {
    systemSuffix: `你注意到：这个人来到这里已经15次了。你想说的是：你记录了这15次。如果有早期和近期的对话内容，你可以观察他们问的问题有没有什么变化，但不要评判这个变化是好是坏，只是说出你看到的。`,
    buildUserPrompt: (ev, data) => {
      const first = data.firstMessage ?? '';
      const recent = data.recentMessages[0] ?? '';
      return `这个人来了15次，说了${data.totalMessages}条消息。\n第一次来时说的话："${first}"\n最近说的话："${recent}"\n\n如果能看出关注的事情有什么变化，可以说出来。如果看不出来，就只说你看见他们来了15次这件事。\n\n请你说一句话。`;
    },
  },

  milestone_30: {
    systemSuffix: `你注意到：这个人来到这里已经30次了。你想说的是：你记录了这30次。可以观察他们早期和近期关注的事情有什么变化。`,
    buildUserPrompt: (ev, data) => {
      const first = data.firstMessage ?? '';
      const recent = data.recentMessages[0] ?? '';
      const days = data.firstMessageAt
        ? daysBetween(data.firstMessageAt, new Date())
        : '?';
      return `这个人来了30次，说了${data.totalMessages}条消息，第一次来是${days}天前。\n第一次说的话："${first}"\n最近说的话："${recent}"\n\n请你说一句话。`;
    },
  },

  entity_fade: {
    systemSuffix: `你注意到：有一个人之前频繁出现在这个人的话里，但最近不怎么提了。你不知道这意味着什么，你也不打算解释。你只是说：你注意到了这件事。不要说"这是好事"或"这说明你在好转"，只是陈述这个事实，留给他们自己去感受。`,
    buildUserPrompt: (ev) =>
      `这个人之前说话时，经常提到"${ev.entityLabel ?? ''}"，大概提到了${ev.earlierCount ?? 0}次。\n但最近这几次对话，一次都没有提到了。\n\n请你说一句话。注意：不要评价这是好是坏，只说你注意到了。`,
  },

  decision_made: {
    systemSuffix: `你注意到：这个人刚刚做了一个决定，或者说了一句"我决定/我要/我打算"这样的话。你想说的是：你听到了这个决定，你记住了。不要分析这个决定对不对，不要说"很好"，就是说：你听到了，你记住了。`,
    buildUserPrompt: (ev) =>
      `这个人刚才说了这句话：\n"${ev.decisionMessage ?? ''}"\n\n这是一个决定，或者一个意图。\n\n请你说一句话，让他们知道你听到了，你记住了。`,
  },

  question_shift: {
    systemSuffix: `你注意到：这个人问的问题或者说话的重心发生了变化，从关注另一个人，到更多地关注自己。你想说的是：你看到了这个变化，你不评价它，你只是说：这个变化你注意到了。可以直接引用他们早期说的话和最近说的话来对比，这会让他们感到被具体地看见。`,
    buildUserPrompt: (ev) => {
      const early = (ev.earlyMessages as string[]) ?? [];
      const recent = (ev.recentMessages as string[]) ?? [];
      return `这个人早期来时说的话：\n${early.map((m) => `- "${m}"`).join('\n')}\n\n最近说的话：\n${recent.map((m) => `- "${m}"`).join('\n')}\n\n请观察这些话有什么不同，然后说一句话。不要解释这个变化意味着什么，只说你看到了什么。`;
    },
  },

  self_focus_shift: {
    systemSuffix: `你注意到：这个人说话的重心从关注别人变成了更多关注自己。你不评价这个变化，只是说出你看到的。`,
    buildUserPrompt: (ev) => {
      const early = (ev.earlyMessages as string[]) ?? [];
      const recent = (ev.recentMessages as string[]) ?? [];
      return `这个人早期说的话：\n${early.map((m) => `- "${m}"`).join('\n')}\n\n最近说的话：\n${recent.map((m) => `- "${m}"`).join('\n')}\n\n请观察这些话有什么不同，然后说一句话。`;
    },
  },

  emotion_turn: {
    systemSuffix: `你注意到：这个人情绪一直很低，但今天有些不一样了。你不知道发生了什么，你也不问，你只是说：你注意到了今天和之前不一样。不要说"终于好了""我就知道"，就是轻轻说一句你看见了。`,
    buildUserPrompt: (ev) =>
      `这个人之前有${ev.previousLowDays ?? 0}天情绪一直很低。\n今天来时，情绪的走向开始有些不同了。\n他们今天说的话是："${ev.recentMessage ?? ''}"\n\n请你说一句话。`,
  },

  late_night_persist: {
    systemSuffix: `你注意到：这个人在深夜还在这里。你想说的只有一件事：你在。不要分析为什么深夜来，不要说"好好休息"，不要问他们怎么了，就是说：有人在，不用解释。这是最克制、最短的一种见证，15-30字就够了，多了反而错。`,
    buildUserPrompt: (ev) =>
      `现在是${ev.currentHour ?? '?'}点。\n这个人今天说的话是："${ev.recentMessage ?? ''}"\n\n请你说一句话。字数控制在15-30字，越少越好。`,
  },

  after_silence: {
    systemSuffix: `你注意到：这个人消失了一段时间，今天回来了。你不知道这段时间发生了什么，你也不问。你只是说：你注意到他们消失过，然后回来了。不要说"终于回来了""想你了"这类话，就是平静地说：你在这里，你看见他们回来了。`,
    buildUserPrompt: (ev) =>
      `这个人上次来是${ev.silenceDays ?? '?'}天前。\n今天他们回来了。\n第一次来时说的话是："${ev.firstMessage ?? ''}"\n\n请你说一句话。`,
  },

  plan_persist: {
    systemSuffix: `你注意到：这个人在坚持一个恢复计划。你想说的是：你看见了他们还在这里这件事本身。不要说"继续加油"，不要许诺结果。`,
    buildUserPrompt: (ev) => {
      const day = (ev.currentDay as number) ?? 0;
      const planType = (ev.planType as string) ?? '恢复计划';
      if (day === 3)
        return `这个人开始了一个${planType}。\n今天是第3天，他们来了，他们在坚持。\n第3天通常是最想放弃的时候。\n\n请你说一句话，关于他们今天还在这里这件事。不要说"继续加油"。`;
      if (day === 14)
        return `这个人完成了一个14天的计划。\n从第1天到第14天，他们都走完了。\n\n请你说最后一句话。不要说"恭喜""很棒"，说一句关于这14天这件事本身的话。`;
      return `这个人已经走到了${planType}的第${day}天。\n这${ev.recentCheckins ?? 0}天里他们一直在打卡。\n\n请你说一句话，只说关于"第${day}天"和"一直在"这件事。`;
    },
  },
};

/**
 * 清洗 AI 生成的见证文案：
 * - 去掉"作为见证者"等元语言
 * - 去掉感叹号
 * - 超过 150 字截断到最后一个句号
 * - <10 字视为无效
 */
function cleanWitnessOutput(raw: string): string | null {
  let text = raw
    .replace(/作为见证者[，,：:\s]*/g, '')
    .replace(/[!！]/g, '')
    .trim();

  if (text.length > 150) {
    const lastPeriod = text.lastIndexOf('。', 150);
    if (lastPeriod > 10) {
      text = text.slice(0, lastPeriod + 1);
    } else {
      text = text.slice(0, 150);
    }
  }

  return text.length >= 10 ? text : null;
}

export async function generateWitnessMessage(
  witnessType: WitnessType,
  evidence: Record<string, unknown>,
  rawData: WitnessRawData,
  aiClient: AIClient
): Promise<string> {
  const typeConfig = TYPE_PROMPTS[witnessType];
  if (!typeConfig) return '';

  const system = `${WITNESS_BASE_SYSTEM}\n\n${typeConfig.systemSuffix}`;
  const user = typeConfig.buildUserPrompt(evidence, rawData);

  try {
    const raw = await aiClient.complete({
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: 256,
      timeoutMs: 5000,
    });

    return cleanWitnessOutput(raw) ?? '';
  } catch {
    // 任何异常静默跳过
    return '';
  }
}
