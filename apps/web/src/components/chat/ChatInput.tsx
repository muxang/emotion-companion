import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

export interface ChatInputProps {
  disabled?: boolean;
  streaming?: boolean;
  /** AI 处理中（thinking 事件期间），禁用输入框，与 streaming 效果相同 */
  thinking?: boolean;
  /** 外部受控值（用于快捷话题填入），传入后内部状态会同步 */
  value?: string;
  onValueChange?: (value: string) => void;
  onSend: (text: string) => void;
  onAbort?: () => void;
}

export function ChatInput({
  disabled,
  streaming,
  thinking,
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

  // 流式、思考中或外部 disabled 时锁住输入框
  const inputDisabled = Boolean(disabled || streaming || thinking);

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
      className="flex w-full items-end gap-2 border-t border-neutral-200 bg-white p-3"
    >
      <textarea
        aria-label="输入消息"
        // max-h 约 5 行(每行 ~24px)，超出出现滚动条，不无限撑高
        className="min-h-[44px] max-h-[120px] flex-1 resize-none overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[15px] leading-relaxed text-neutral-800 outline-none focus:border-primary-400 disabled:opacity-60"
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
          className="rounded-xl bg-neutral-200 px-4 py-2 text-sm text-neutral-600"
          onClick={onAbort}
        >
          停止
        </button>
      ) : (
        <button
          type="submit"
          disabled={inputDisabled || value.trim().length === 0}
          className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-40"
        >
          发送
        </button>
      )}
    </form>
  );
}
