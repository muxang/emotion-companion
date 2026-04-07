/**
 * tong-analysis wrapper 输入与输出 Schema。
 *
 * - TongAnalysisInputSchema：由 orchestrator 在调用 skill 前构造校验。
 *   严禁直接传入用户原文，只接收结构化字段。
 * - AnalysisResultSchema：校验 LLM 返回的 JSON 结构。
 *   tone 必须是 gentle / neutral / direct 之一。
 */
import { z } from 'zod';

export const TongAnalysisInputSchema = z.object({
  user_goal: z.string().min(1).max(500),
  relationship_stage: z.string().min(1).max(200),
  facts: z.array(z.string().min(1).max(500)).min(1).max(20),
  user_state: z.string().min(1).max(500),
  /**
   * 内部字段：前端不应关心。
   * 不传时默认请求全部四类输出，让 wrapper 给出完整结构化分析。
   */
  required_output: z
    .array(z.enum(['analysis', 'evidence', 'risks', 'advice']))
    .min(1)
    .default(['analysis', 'evidence', 'risks', 'advice']),
});

export const AnalysisResultSchema = z.object({
  analysis: z.string().min(1),
  evidence: z.array(z.string()),
  risks: z.array(z.string()),
  advice: z.string().min(1),
  confidence: z.number().min(0).max(1),
  tone: z.enum(['gentle', 'neutral', 'direct']),
});

/**
 * 关系分析接口的对外请求体。
 * 前端只传一段自然语言；后端 services/extractAnalysisInput 抽取出
 * TongAnalysisInput 后再交给 wrapper。
 */
export const AnalysisRequestSchema = z.object({
  user_text: z.string().min(10).max(1000),
});

export type TongAnalysisInputParsed = z.infer<typeof TongAnalysisInputSchema>;
export type AnalysisResultParsed = z.infer<typeof AnalysisResultSchema>;
export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
