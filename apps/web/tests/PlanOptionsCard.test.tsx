import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanOptionsCard } from '../src/components/cards/PlanOptionsCard.js';

describe('<PlanOptionsCard />', () => {
  it('渲染两个计划按钮', () => {
    render(<PlanOptionsCard onSelect={() => {}} />);
    expect(screen.getByTestId('plan-option-7day-breakup')).toBeInTheDocument();
    expect(
      screen.getByTestId('plan-option-14day-rumination')
    ).toBeInTheDocument();
  });

  it('点击 7 天按钮触发 onSelect 并发送对应消息', () => {
    const onSelect = vi.fn();
    render(<PlanOptionsCard onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('plan-option-7day-breakup'));
    expect(onSelect).toHaveBeenCalledWith('我想开始7天失恋恢复计划');
  });

  it('选中后另一个按钮被禁用,无法再触发回调', () => {
    const onSelect = vi.fn();
    render(<PlanOptionsCard onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('plan-option-7day-breakup'));
    const other = screen.getByTestId(
      'plan-option-14day-rumination'
    ) as HTMLButtonElement;
    expect(other).toBeDisabled();
    fireEvent.click(other);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('isLastMessage=false 时不显示按钮，只显示已选择计划提示', () => {
    const onSelect = vi.fn();
    render(<PlanOptionsCard onSelect={onSelect} isLastMessage={false} />);
    expect(screen.queryByTestId('plan-option-7day-breakup')).toBeNull();
    expect(screen.queryByTestId('plan-option-14day-rumination')).toBeNull();
    expect(screen.getByText('已选择计划')).toBeInTheDocument();
  });
});
