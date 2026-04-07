import { useState, type FormEvent, type KeyboardEvent } from 'react';

export interface ChatInputProps {
  disabled?: boolean;
  streaming?: boolean;
  onSend: (text: string) => void;
  onAbort?: () => void;
}

export function ChatInput({
  disabled,
  streaming,
  onSend,
  onAbort,
}: ChatInputProps): JSX.Element {
  const [value, setValue] = useState('');

  const submit = (): void => {
    const text = value.trim();
    if (!text || disabled || streaming) return;
    onSend(text);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    submit();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full items-end gap-2 border-t border-warm-100 bg-white p-3"
    >
      <textarea
        aria-label="输入消息"
        className="min-h-[44px] max-h-40 flex-1 resize-none rounded-xl border border-warm-100 bg-warm-50 px-3 py-2 text-sm text-warm-700 outline-none focus:border-warm-500"
        placeholder="想说什么都可以…"
        rows={1}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {streaming ? (
        <button
          type="button"
          className="rounded-xl bg-warm-100 px-4 py-2 text-sm text-warm-700"
          onClick={onAbort}
        >
          停止
        </button>
      ) : (
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          className="rounded-xl bg-warm-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          发送
        </button>
      )}
    </form>
  );
}
