import type { MessageCoachResult } from '@emotion/shared';

/**
 * message-coach 输入。
 *
 * 设计原则：
 *  - 不传整段用户原文进 prompt（与 tong-analysis 一致）
 *  - scenario   ：对话背景（最近发生的事 / 当前卡点的客观描述）
 *  - user_goal  ：用户想通过这条消息达成的目的或想表达的意图
 *  - relationship_stage：可选，关系阶段，影响语气选择
 *  - draft      ：可选，用户已有草稿，由模型改写
 */
export interface MessageCoachInput {
  scenario: string;
  user_goal: string;
  relationship_stage?: string;
  draft?: string;
}

export type MessageCoachOutput = MessageCoachResult;
