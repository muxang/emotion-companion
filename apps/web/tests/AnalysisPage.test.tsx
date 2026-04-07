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
import { useSessionStore } from '../src/stores/sessionStore.js';
import { useAnalysisStore } from '../src/stores/analysisStore.js';

const mockedRequest = vi.mocked(requestAnalysis);

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/analysis']}>
      <AnalysisPage />
    </MemoryRouter>
  );
}

function fillForm(): void {
  fireEvent.change(screen.getByLabelText('你想弄清楚什么'), {
    target: { value: '判断对方是否还有感情' },
  });
  fireEvent.change(screen.getByLabelText('客观事实（每行一条）'), {
    target: { value: '最近一周回复变慢\n上周末没有约见面' },
  });
  fireEvent.change(screen.getByLabelText('你现在的状态'), {
    target: { value: '焦虑反复' },
  });
}

describe('<AnalysisPage />', () => {
  beforeEach(() => {
    mockedRequest.mockReset();

    // 强制 auth 已登录
    useAuthStore.setState({
      status: 'authed',
      userId: 'u-1',
      anonymousId: 'anon-1',
      error: null,
    });

    // 提供假的 ensureSession 实现，避免真实网络请求
    useSessionStore.setState({
      sessions: [],
      currentSessionId: 'session-1',
      currentMessages: [],
      loading: false,
      error: null,
    });

    // 重置分析状态
    useAnalysisStore.setState({
      result: null,
      status: 'idle',
      error: null,
    });
  });

  it('提交表单时调用分析接口并按结构化输入传参', async () => {
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
    fillForm();
    fireEvent.click(screen.getByText('开始分析'));

    await waitFor(() => {
      expect(mockedRequest).toHaveBeenCalledTimes(1);
    });
    expect(mockedRequest).toHaveBeenCalledWith({
      session_id: 'session-1',
      user_goal: '判断对方是否还有感情',
      relationship_stage: 'ambiguous',
      facts: ['最近一周回复变慢', '上周末没有约见面'],
      user_state: '焦虑反复',
    });
  });

  it('加载中显示分析中…文案', async () => {
    let resolveFn: (v: AnalysisResult) => void = () => undefined;
    mockedRequest.mockImplementationOnce(
      () =>
        new Promise<AnalysisResult>((resolve) => {
          resolveFn = resolve;
        })
    );

    renderPage();
    fillForm();
    fireEvent.click(screen.getByText('开始分析'));

    await waitFor(() => {
      // 按钮文案切换为分析中…，同时下方加载提示也出现
      expect(screen.getAllByText('分析中…').length).toBeGreaterThanOrEqual(1);
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
    fillForm();
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
    fillForm();
    fireEvent.click(screen.getByText('开始分析'));

    await waitFor(() => {
      expect(screen.getByText('服务暂时不可用')).toBeInTheDocument();
    });
  });

  it('字段未填齐时提交按钮被禁用', () => {
    renderPage();
    const button = screen.getByText('开始分析') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
