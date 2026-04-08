import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AnalysisResult } from '@emotion/shared';
import { AnalysisResultCard } from '../src/components/cards/AnalysisResultCard.js';

const baseResult: AnalysisResult = {
  analysis: '对方在用低成本回应维持联系,但没有主动推进。',
  evidence: ['只在深夜回消息', '从不主动联系'],
  risks: ['可能陷入长期等待'],
  advice: '把节奏交给自己,先停止主动联系一周看反应。',
  confidence: 0.72,
  tone: 'neutral',
};

describe('<AnalysisResultCard />', () => {
  it('渲染分析结论、证据列表、风险与建议', () => {
    render(<AnalysisResultCard payload={baseResult} />);
    expect(screen.getByTestId('analysis-result-card')).toBeInTheDocument();
    expect(screen.getByText(baseResult.analysis)).toBeInTheDocument();
    expect(screen.getByText('· 只在深夜回消息')).toBeInTheDocument();
    expect(screen.getByText('· 从不主动联系')).toBeInTheDocument();
    expect(screen.getByText('· 可能陷入长期等待')).toBeInTheDocument();
    expect(screen.getByText(baseResult.advice)).toBeInTheDocument();
  });

  it('置信度按百分比展示并设置进度条宽度', () => {
    render(<AnalysisResultCard payload={baseResult} />);
    expect(screen.getByText('72%')).toBeInTheDocument();
    const bar = screen.getByTestId('analysis-confidence-bar');
    expect(bar).toHaveStyle({ width: '72%' });
  });

  it('risks 为空时不渲染风险区块', () => {
    render(
      <AnalysisResultCard payload={{ ...baseResult, risks: [] }} />
    );
    expect(screen.queryByText('风险提示')).not.toBeInTheDocument();
  });
});
