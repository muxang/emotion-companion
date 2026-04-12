import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/api/memory.js', () => ({
  getTimeline: vi.fn(),
  deleteMemory: vi.fn(),
  getEmotionTrend: vi.fn(),
  getPatterns: vi.fn(),
}));

import { GrowthPage } from '../src/pages/Growth/GrowthPage.js';
import {
  getTimeline,
  deleteMemory,
  getEmotionTrend,
  getPatterns,
  type GrowthFeed,
  type TimelineEvent,
  type TimelineEntity,
  type TimelineSummary,
} from '../src/api/memory.js';
import { useAuthStore } from '../src/stores/authStore.js';

const mockedGetTimeline = vi.mocked(getTimeline);
const mockedDeleteMemory = vi.mocked(deleteMemory);
const mockedGetEmotionTrend = vi.mocked(getEmotionTrend);
const mockedGetPatterns = vi.mocked(getPatterns);

const EMPTY_FEED: GrowthFeed = { events: [], entities: [], summaries: [] };

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/growth']}>
      <GrowthPage />
    </MemoryRouter>
  );
}

describe('<GrowthPage />', () => {
  beforeEach(() => {
    mockedGetTimeline.mockReset();
    mockedDeleteMemory.mockReset();
    mockedGetEmotionTrend.mockReset();
    mockedGetPatterns.mockReset();
    mockedGetEmotionTrend.mockResolvedValue({
      trend: null,
      message: '继续聊几次',
    });
    mockedGetPatterns.mockResolvedValue({
      patterns: [],
      analyzed_messages: 0,
      sufficient_data: false,
      cached: false,
      message: '数据不足',
    });
    useAuthStore.setState({
      status: 'authed',
      userId: 'u-1',
      anonymousId: 'anon-1',
      error: null,
    });
  });

  it('三类信号都为空时显示提示文案', async () => {
    mockedGetTimeline.mockResolvedValueOnce(EMPTY_FEED);
    renderPage();

    // 切到"成长记录" Tab
    await waitFor(() => {
      expect(screen.getByText('成长记录')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('成长记录'));

    await waitFor(() => {
      expect(screen.getByTestId('growth-empty')).toBeInTheDocument();
    });
    expect(
      screen.getByText('还没有记录,多聊几次后这里会出现你的成长足迹')
    ).toBeInTheDocument();
  });

  it('按 created_at 倒序渲染 events 段落并展示中文类型标签', async () => {
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        event_type: 'breakup',
        event_time: '2026-03-01T00:00:00Z',
        summary: '提出分开',
        entity_label: '小A',
        created_at: '2026-03-01T00:00:00Z',
      },
      {
        id: 'e2',
        event_type: 'reconcile',
        event_time: null,
        summary: '尝试和好',
        entity_label: null,
        created_at: '2026-03-15T00:00:00Z',
      },
    ];
    mockedGetTimeline.mockResolvedValueOnce({
      ...EMPTY_FEED,
      events,
    });

    renderPage();

    // 切到"成长记录" Tab 才能看到事件时间线
    await waitFor(() => {
      expect(screen.getByText('成长记录')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('成长记录'));

    // 等待事件内容渲染完成（tab 切换 + 数据加载都是异步的）
    // 注意：筛选栏里也有"分手""复合"等文字，所以用 getAllByText
    await waitFor(() => {
      expect(screen.getByText('提出分开')).toBeInTheDocument();
    });

    expect(screen.getAllByText('分手').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('复合').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('尝试和好')).toBeInTheDocument();

    // 倒序：reconcile 应在 breakup 之前
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('尝试和好');
    expect(items[1]).toHaveTextContent('提出分开');
  });

  it('渲染 summaries 段落（普通对话产生）', async () => {
    const summaries: TimelineSummary[] = [
      {
        id: 's1',
        session_id: 'sess-1',
        summary_type: 'session',
        summary_text: '本周聊到对暧昧期的反复思考,情绪从焦虑转为平稳',
        created_at: '2026-04-01T10:00:00Z',
      },
    ];
    mockedGetTimeline.mockResolvedValueOnce({
      ...EMPTY_FEED,
      summaries,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('growth-summaries')).toBeInTheDocument();
    });
    expect(
      screen.getByText('本周聊到对暧昧期的反复思考,情绪从焦虑转为平稳')
    ).toBeInTheDocument();
  });

  it('渲染 entities 段落（关系对象 chip）', async () => {
    const entities: TimelineEntity[] = [
      {
        id: 'ent-1',
        label: '小A',
        relation_type: 'ex',
        notes: null,
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-02T00:00:00Z',
      },
    ];
    mockedGetTimeline.mockResolvedValueOnce({
      ...EMPTY_FEED,
      entities,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('growth-entities')).toBeInTheDocument();
    });
    expect(screen.getByText('小A')).toBeInTheDocument();
    expect(screen.getByText('· 前任')).toBeInTheDocument();
  });

  it('点击清除记忆弹出确认弹窗,确认后调用 deleteMemory 并清空列表', async () => {
    mockedGetTimeline.mockResolvedValueOnce({
      ...EMPTY_FEED,
      events: [
        {
          id: 'e1',
          event_type: 'cold-war',
          event_time: null,
          summary: '冷战中',
          entity_label: null,
          created_at: '2026-04-01T00:00:00Z',
        },
      ],
    });
    mockedDeleteMemory.mockResolvedValueOnce(undefined);

    renderPage();

    // 切到"成长记录" Tab
    await waitFor(() => {
      expect(screen.getByText('成长记录')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('成长记录'));

    await waitFor(() => {
      expect(screen.getByText('冷战中')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('清除记忆'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('确认清除')).toBeInTheDocument();

    fireEvent.click(screen.getByText('确认清除'));

    await waitFor(() => {
      expect(mockedDeleteMemory).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('growth-empty')).toBeInTheDocument();
  });

  it('确认弹窗可取消', async () => {
    mockedGetTimeline.mockResolvedValueOnce(EMPTY_FEED);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('成长记录')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('成长记录'));

    await waitFor(() => {
      expect(screen.getByTestId('growth-empty')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('清除记忆'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('取消'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockedDeleteMemory).not.toHaveBeenCalled();
  });
});
