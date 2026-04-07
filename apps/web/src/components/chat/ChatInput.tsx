import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

export interface ChatInputProps {
  disabled?: boolean;
  streaming?: boolean;
  /** 外部受控值（用于快捷话题填入），传入后内部状态会同步 */
  value?: string;
  onValueChange?: (value: string) => void;
  onSend: (text: string) => void;
  onAbort?: () => void;
}

export function ChatInput({
  disabled,
  streaming,
  value: controlledValue,
  onValueChange,
  onSend,
  onAbort,
}: ChatInputProps): JSX.Element {
  const [innerValue, setInnerValue] = useState('');
  const value = controlledValue ?? innerValue;

  // 外部传入的 value 变化时，作为预填内容同步到内部
  useEffect(() => {
    if (controlledValue !== undefined) setInnerValue(controlledValue);
  }, [controlledValue]);

  const setValue = (next: string): void => {
    setInnerValue(next);
    onValueChange?.(next);
  };

  // 流式或外部 disabled 时锁住输入框
  const inputDisabled = Boolean(disabled || streaming);

  const submit = (): void => {
    const text = value.trim();
    if (!text || inputDisabled) return;
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
        // max-h 约 5 行(每行 ~24px)，超出出现滚动条，不无限撑高
        className="min-h-[44px] max-h-[120px] flex-1 resize-none overflow-y-auto rounded-xl border border-warm-100 bg-warm-50 px-3 py-2 text-sm text-warm-700 outline-none focus:border-warm-500 disabled:opacity-60"
        placeholder="想说什么都可以…"
        rows={1}
        value={value}
        disabled={inputDisabled}
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
          disabled={inputDisabled || value.trim().length === 0}
          className="rounded-xl bg-warm-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          发送
        </button>
      )}
    </form>
  );
}
