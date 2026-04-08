import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CheckinDoneCard } from '../src/components/cards/CheckinDoneCard.js';

describe('<CheckinDoneCard />', () => {
  it('显示打卡天数、心情评分与鼓励语', () => {
    render(
      <CheckinDoneCard
        payload={{
          day_index: 3,
          mood_score: 6,
          encouragement: '比昨天稳一点点,就是进步。',
        }}
      />
    );
    expect(screen.getByTestId('checkin-done-card')).toBeInTheDocument();
    expect(screen.getByText('✓ 第 3 天打卡完成')).toBeInTheDocument();
    expect(screen.getByText('6/10')).toBeInTheDocument();
    expect(
      screen.getByText('比昨天稳一点点,就是进步。')
    ).toBeInTheDocument();
  });

  it('无 encouragement 时只显示天数与心情', () => {
    render(<CheckinDoneCard payload={{ day_index: 1, mood_score: 4 }} />);
    expect(screen.getByText('✓ 第 1 天打卡完成')).toBeInTheDocument();
    expect(screen.getByText('4/10')).toBeInTheDocument();
  });
});
