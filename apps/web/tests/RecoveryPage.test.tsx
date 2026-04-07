import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/api/recovery.js', () => ({
  getPlans: vi.fn(),
  createPlan: vi.fn(),
  getPlanDetail: vi.fn(),
  submitCheckin: vi.fn(),
}));

import { RecoveryPage } from '../src/pages/Recovery/RecoveryPage.js';
import {
  getPlans,
  createPlan,
  getPlanDetail,
  submitCheckin,
  type RecoveryPlan,
  type RecoveryPlanDetail,
  type RecoveryCheckin,
} from '../src/api/recovery.js';
import { useAuthStore } from '../src/stores/authStore.js';
import { useRecoveryStore } from '../src/stores/recoveryStore.js';

const mockedGetPlans = vi.mocked(getPlans);
const mockedCreatePlan = vi.mocked(createPlan);
const mockedGetPlanDetail = vi.mocked(getPlanDetail);
const mockedSubmitCheckin = vi.mocked(submitCheckin);

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/recovery']}>
      <RecoveryPage />
    </MemoryRouter>
  );
}

const samplePlan: RecoveryPlan = {
  id: 'p-1',
  user_id: 'u-1',
  plan_type: '7-day-breakup',
  total_days: 7,
  current_day: 2,
  status: 'active',
  started_at: '2026-04-01T00:00:00Z',
};

const sampleDetail: RecoveryPlanDetail = {
  plan: samplePlan,
  todayTask: {
    task: '今天先把对方的联系方式从置顶移除',
    reflection_prompt: '当你不再随时能看到对方,你的注意力会落在哪里?',
    encouragement: '迈出第一步比走完全程更难,你已经在做了。',
  },
  checkins: [],
};

describe('<RecoveryPage />', () => {
  beforeEach(() => {
    mockedGetPlans.mockReset();
    mockedCreatePlan.mockReset();
    mockedGetPlanDetail.mockReset();
    mockedSubmitCheckin.mockReset();
    useAuthStore.setState({
      status: 'authed',
      userId: 'u-1',
      anonymousId: 'anon-1',
      error: null,
    });
    useRecoveryStore.getState().reset();
  });

  it('无计划时渲染空状态与两个选项卡片', async () => {
    mockedGetPlans.mockResolvedValueOnce([]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('recovery-empty')).toBeInTheDocument();
    });
    expect(screen.getByText('开始你的恢复计划')).toBeInTheDocument();
    expect(screen.getByText('7天走出失恋')).toBeInTheDocument();
    expect(screen.getByText('适合刚分手、反复联系的情况')).toBeInTheDocument();
    expect(screen.getByText('14天停止内耗')).toBeInTheDocument();
    expect(screen.getByText('适合暧昧期、反复纠结的情况')).toBeInTheDocument();
    expect(screen.getByTestId('plan-option-7-day-breakup')).toBeInTheDocument();
    expect(
      screen.getByTestId('plan-option-14-day-overthinking')
    ).toBeInTheDocument();
  });

  it('点击选项卡片触发 createPlan 并加载详情', async () => {
    mockedGetPlans.mockResolvedValueOnce([]);
    mockedCreatePlan.mockResolvedValueOnce(samplePlan);
    mockedGetPlanDetail.mockResolvedValueOnce(sampleDetail);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('plan-option-7-day-breakup')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('plan-option-7-day-breakup'));

    await waitFor(() => {
      expect(mockedCreatePlan).toHaveBeenCalledWith('7-day-breakup');
    });
    await waitFor(() => {
      expect(mockedGetPlanDetail).toHaveBeenCalledWith('p-1');
    });
    await waitFor(() => {
      expect(screen.getByTestId('recovery-active')).toBeInTheDocument();
    });
    expect(screen.getByText('Day 2 / 7')).toBeInTheDocument();
    expect(
      screen.getByText('今天先把对方的联系方式从置顶移除')
    ).toBeInTheDocument();
  });

  it('打卡按钮点击后调用 submitCheckin', async () => {
    mockedGetPlans.mockResolvedValueOnce([samplePlan]);
    mockedGetPlanDetail.mockResolvedValueOnce(sampleDetail);

    const newCheckin: RecoveryCheckin = {
      id: 'c-1',
      plan_id: 'p-1',
      day_index: 2,
      completed: true,
      reflection: '好像没那么想他了',
      mood_score: 6,
      created_at: '2026-04-07T10:00:00Z',
    };
    mockedSubmitCheckin.mockResolvedValueOnce(newCheckin);
    // submitCheckin 后会再次拉取详情
    mockedGetPlanDetail.mockResolvedValueOnce({
      ...sampleDetail,
      plan: { ...samplePlan, current_day: 3 },
      checkins: [newCheckin],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('recovery-active')).toBeInTheDocument();
    });

    const slider = screen.getByTestId(
      'recovery-mood-slider'
    ) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '6' } });

    const reflectionInput = screen.getByTestId(
      'recovery-reflection-input'
    ) as HTMLTextAreaElement;
    fireEvent.change(reflectionInput, {
      target: { value: '好像没那么想他了' },
    });

    fireEvent.click(screen.getByTestId('recovery-checkin-submit'));

    await waitFor(() => {
      expect(mockedSubmitCheckin).toHaveBeenCalledWith('p-1', {
        mood_score: 6,
        reflection: '好像没那么想他了',
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('recovery-checkin-done')).toBeInTheDocument();
    });
  });
});
