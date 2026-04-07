/** Short-term in-memory conversation buffer - Phase 0 skeleton. */
export interface ShortTermMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export class ShortTermMemory {
  private readonly buffer: ShortTermMessage[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 10) {
    this.maxSize = maxSize;
  }

  push(message: ShortTermMessage): void {
    this.buffer.push(message);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  list(): readonly ShortTermMessage[] {
    return this.buffer;
  }
}
