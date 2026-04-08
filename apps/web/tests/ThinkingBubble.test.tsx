import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThinkingBubble } from '../src/components/chat/ThinkingBubble.js';

describe('<ThinkingBubble />', () => {
  it('渲染 thinking-bubble 容器', () => {
    render(<ThinkingBubble message="正在理解你说的话..." />);
    expect(screen.getByTestId('thinking-bubble')).toBeInTheDocument();
  });

  it('显示传入的 message 文字', () => {
    render(<ThinkingBubble message="正在分析关系情况..." />);
    expect(screen.getByText('正在分析关系情况...')).toBeInTheDocument();
  });

  it('message 变化后更新展示内容', () => {
    const { rerender } = render(<ThinkingBubble message="正在组织回复..." />);
    expect(screen.getByText('正在组织回复...')).toBeInTheDocument();
    rerender(<ThinkingBubble message="正在优化回复..." />);
    expect(screen.getByText('正在优化回复...')).toBeInTheDocument();
  });
});
