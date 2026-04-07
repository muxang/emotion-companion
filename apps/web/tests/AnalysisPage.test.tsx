import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AnalysisResult } from '@emotion/shared';

// 必须在 import 被测组件之前 mock api 模块
vi.mock('../src/api/analysis.js', () => ({
  requestAnalysis: vi.fn(),
}));

import { AnalysisPage } from '../src/pages/Analysis/AnalysisPage.js';
import { requestAnalysis } from '../src/api/analysis.js';
import { useAuthStore } from '../src/stores/authStore.js';
import { useAnalysisStore } from '../src/stores/analysisStore.js';

const mockedRequest = vi.mocked(requestAnalysis);

const SAMPLE_TEXT =
  '暧昧三个月，他从不主动联系我，只在深夜回消息，我不知道要不要继续等。';

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/analysis']}>
      <AnalysisPage />
    </MemoryRouter>
  );
}

function fillTextarea(text: string): void {
  fireEvent.change(screen.getByLabelText('情况描述'), {
    target: { value: text },
  });
}

describe('<AnalysisPage />', () => {
  beforeEach(() => {
    mockedRequest.mockReset();

    useAuthStore.setState({
      status: 'authed',
      userId: 'u-1',
      anonymousId: 'anon-1',
      error: null,
    });

    useAnalysisStore.setState({
      result: null,
      status: 'idle',
      error: null,
    });
  });

  it('提交时只把 user_text 传给后端', async () => {
    const result: AnalysisResult = {
      analysis: '对方目前精力被工作占据，感情未必消退。',
      evidence: ['回复变慢但仍主动'],
      risks: ['持续追问可能加剧距离感'],
      advice: '本周减少主动联系频率，观察对方反应。',
      confidence: 0.7,
      tone: 'neutral',
    };
    mockedRequest.mockResolvedValueOnce(result);

    renderPage();
    fillTextarea(SAMPLE_TEXT);
    fireEvent.click(screen.getByText('开始分析'));

    await waitFor(() => {
      expect(mockedRequest).toHaveBeenCalledTimes(1);
    });
    expect(mockedRequest).toHaveBeenCalledWith({ user_text: SAMPLE_TEXT });
  });

  it('加载中显示正在分析的友好文案', async () => {
    let resolveFn: (v: AnalysisResult) => void = () => undefined;
    mockedRequest.mockImplementationOnce(
      () =>
        new Promise<AnalysisResult>((resolve) => {
          resolveFn = resolve;
        })
    );

    renderPage();
    fillTextarea(SAMPLE_TEXT);
    fireEvent.click(screen.getByText('开始分析'));

    await waitFor(() => {
      expect(
        screen.getByText('AI 正在分析中，通常需要 10-20 秒…')
      ).toBeInTheDocument();
    });

    resolveFn({
      analysis: 'x',
      evidence: [],
      risks: [],
      advice: 'y',
      confidence: 0.5,
      tone: 'neutral',
    });
  });

  it('成功后渲染结果卡片，包含分析、证据、风险、建议、置信度', async () => {
    const result: AnalysisResult = {
      analysis: '基于事实，对方仍有联系意愿。',
      evidence: ['仍主动发起对话', '会主动分享日常'],
      risks: ['过度解读单次冷淡'],
      advice: '继续以平常心相处。',
      confidence: 0.62,
      tone: 'gentle',
    };
    mockedRequest.mockResolvedValueOnce(result);

    renderPage();
    fillTextarea(SAMPLE_TEXT);
    fireEvent.click(screen.getByText('开始分析'));

    await waitFor(() => {
      expect(screen.getByTestId('analysis-result')).toBeInTheDocument();
    });

    expect(screen.getByText('基于事实，对方仍有联系意愿。')).toBeInTheDocument();
    expect(screen.getByText('仍主动发起对话')).toBeInTheDocument();
    expect(screen.getByText('过度解读单次冷淡')).toBeInTheDocument();
    expect(screen.getByText('继续以平常心相处。')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('62');
  });

  it('请求失败时显示友好错误提示', async () => {
    mockedRequest.mockRejectedValueOnce(new Error('服务暂时不可用'));

    renderPage();
    fillTextarea(SAMPLE_TEXT);
    fireEvent.click(screen.getByText('开始分析'));

    await waitFor(() => {
      expect(screen.getByText('服务暂时不可用')).toBeInTheDocument();
    });
  });

  it('文本未达到最少 10 字时按钮被禁用', () => {
    renderPage();
    const button = screen.getByText('开始分析') as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fillTextarea('太短了'); // 3 字
    expect(button.disabled).toBe(true);
  });

  it('达到 10 字后按钮可用', () => {
    renderPage();
    fillTextarea('这是一段足够长的描述用于测试');
    const button = screen.getByText('开始分析') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('字数提示展示已输入字符数', () => {
    renderPage();
    fillTextarea(SAMPLE_TEXT);
    expect(
      screen.getByText(`已输入 ${SAMPLE_TEXT.length} / 1000 字`)
    ).toBeInTheDocument();
  });
});
