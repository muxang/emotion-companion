import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from '../src/components/chat/ChatInput.js';

describe('<ChatInput />', () => {
  it('calls onSend with trimmed text on Enter', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText('输入消息');
    fireEvent.change(textarea, { target: { value: '  你好  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSend).toHaveBeenCalledWith('你好');
  });

  it('does not send on Shift+Enter', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText('输入消息');
    fireEvent.change(textarea, { target: { value: '换行' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows abort button while streaming', () => {
    const onAbort = vi.fn();
    render(<ChatInput streaming onSend={() => undefined} onAbort={onAbort} />);
    const stop = screen.getByText('停止');
    fireEvent.click(stop);
    expect(onAbort).toHaveBeenCalled();
  });

  it('disables send when input is empty', () => {
    render(<ChatInput onSend={() => undefined} />);
    const button = screen.getByText('发送') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('disables textarea while streaming', () => {
    render(<ChatInput streaming onSend={() => undefined} />);
    const textarea = screen.getByLabelText('输入消息') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
  });

  it('applies max-height limit so it cannot grow indefinitely', () => {
    render(<ChatInput onSend={() => undefined} />);
    const textarea = screen.getByLabelText('输入消息') as HTMLTextAreaElement;
    expect(textarea.className).toMatch(/max-h-\[120px\]/);
    expect(textarea.className).toMatch(/overflow-y-auto/);
  });

  it('syncs external value (controlled prefill from quick topics)', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <ChatInput value="" onValueChange={onValueChange} onSend={() => undefined} />
    );
    rerender(
      <ChatInput
        value="预填话题"
        onValueChange={onValueChange}
        onSend={() => undefined}
      />
    );
    const textarea = screen.getByLabelText('输入消息') as HTMLTextAreaElement;
    expect(textarea.value).toBe('预填话题');
  });
});
