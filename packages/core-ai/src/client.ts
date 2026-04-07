/**
 * Anthropic client wrapper - Phase 0 placeholder.
 */
export interface AIClientConfig {
  apiKey: string;
  model?: string;
}

export class AIClient {
  private readonly config: AIClientConfig;

  constructor(config: AIClientConfig) {
    if (!config.apiKey) {
      throw new Error('AIClient: apiKey is required');
    }
    this.config = config;
  }

  getModel(): string {
    return this.config.model ?? 'claude-sonnet-4-6';
  }
}
