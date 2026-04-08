import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { MessageCoachResult } from '@emotion/shared';
import { CoachResultCard } from '../src/components/cards/CoachResultCard.js';

const sample: MessageCoachResult = {
  options: [
    {
      version: 'A',
      content: '今天有点想你,但不打扰你。',
      tone: 'warm',
      usage_tip: '适合关系还在的情况',
    },
    {
      version: 'B',
      content: '我们之间需要一次坦诚的对话。',
      tone: 'direct',
      usage_tip: '适合需要明确态度时',
    },
    {
      version: 'C',
      content: '在吗,有件好玩的事想跟你说。',
      tone: 'light',
      usage_tip: '适合打破冷场',
    },
  ],
};

describe('<CoachResultCard />', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('渲染三版话术', () => {
    render(<CoachResultCard payload={sample} />);
    expect(screen.getByTestId('coach-result-card')).toBeInTheDocument();
    expect(screen.getByTestId('coach-option-0')).toBeInTheDocument();
    expect(screen.getByTestId('coach-option-1')).toBeInTheDocument();
    expect(screen.getByTestId('coach-option-2')).toBeInTheDocument();
  });

  it('点击复制后按钮文字变为已复制 ✓', async () => {
    render(<CoachResultCard payload={sample} />);
    const btn = screen.getByTestId('coach-copy-0');
    expect(btn).toHaveTextContent('复制');
    fireEvent.click(btn);
    expect(writeText).toHaveBeenCalledWith(sample.options[0]!.content);
    await waitFor(() => {
      expect(screen.getByTestId('coach-copy-0')).toHaveTextContent(
        '已复制 ✓'
      );
    });
  });
});
