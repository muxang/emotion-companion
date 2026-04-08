import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlanCreatedCard } from '../src/components/cards/PlanCreatedCard.js';

describe('<PlanCreatedCard />', () => {
  it('显示已知计划类型的中文名称与天数文案', () => {
    render(
      <PlanCreatedCard
        payload={{
          plan_id: 'p-1',
          plan_type: '7day-breakup',
          total_days: 7,
        }}
      />
    );
    expect(screen.getByTestId('plan-created-card')).toBeInTheDocument();
    expect(screen.getByText('7天走出失恋')).toBeInTheDocument();
    expect(screen.getByText(/今天是第 1 天/)).toBeInTheDocument();
  });

  it('未知 plan_type 时回退使用 total_days 描述', () => {
    render(
      <PlanCreatedCard
        payload={{ plan_id: 'p-2', plan_type: 'custom', total_days: 21 }}
      />
    );
    expect(screen.getByText('21天恢复计划')).toBeInTheDocument();
  });
});
