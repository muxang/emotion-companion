/** Session summarizer - Phase 0 skeleton. Phase 5 实现完整异步摘要。 */
export interface SummarizeInput {
  session_id: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface SummarizeOutput {
  summary: string;
  topics: string[];
}

export async function summarizeSession(
  _input: SummarizeInput
): Promise<SummarizeOutput> {
  throw new Error('summarizeSession not implemented (Phase 5)');
}
