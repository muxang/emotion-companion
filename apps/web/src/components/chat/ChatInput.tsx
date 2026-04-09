import {
  useEffect,
  useRef,
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

/**
 * 输入框为空时显示的关键词提示，用户可以点击直接填入。
 * 用极弱化的样式（小字号、灰色、细描边），让用户"看到知道有"
 * 但不打扰正常对话。
 */
const HINT_CHIPS: ReadonlyArray<{ label: string; icon: string }> = [
  { label: '帮我分析这段关系', icon: '🔍' },
  { label: '我想开始恢复计划', icon: '📅' },
  { label: '帮我写条消息', icon: '✍️' },
  { label: '今天打个卡', icon: '✓' },
];

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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const prevValueRef = useRef<string>(value);

  // 外部传入的 value 变化时，作为预填内容同步到内部
  useEffect(() => {
    if (controlledValue !== undefined) setInnerValue(controlledValue);
  }, [controlledValue]);

  // 当 value 从"空"跳到"非空"时自动聚焦：覆盖两种入口
  //  1. 用户点 hint chip
  //  2. 父组件（ChatPage 空状态卡片）调用 setInputValue 预填示例
  // 用 ref 记录上一次的值，只在边沿触发，避免每次输入都抢焦点
  useEffect(() => {
    const prev = prevValueRef.current;
    prevValueRef.current = value;
    if (prev === '' && value !== '') {
      textareaRef.current?.focus();
      // 把光标放到末尾，方便用户继续编辑
      const len = value.length;
      textareaRef.current?.setSelectionRange(len, len);
    }
  }, [value]);

  const setValue = (next: string): void => {
    setInnerValue(next);
    onValueChange?.(next);
  };

  // 流式、思考中或外部 disabled 时锁住输入框
  const inputDisabled = Boolean(disabled || streaming || thinking);
  // hint chips 显示条件：输入为空 + 不在流式/思考中 + 没被外部禁用
  const showHintChips = value === '' && !inputDisabled;

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
      className="flex w-full flex-col gap-2 border-t border-neutral-200 bg-white p-3"
    >
      {showHintChips ? (
        <div
          className="mb-1 mt-1.5 flex flex-wrap gap-2 px-1"
          data-testid="chat-hint-chips"
        >
          {HINT_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setValue(chip.label)}
              className="cursor-pointer rounded-full border border-neutral-200 bg-transparent px-2.5 py-0.5 text-[12px] text-neutral-400 transition-colors hover:border-primary-300 hover:text-primary-500"
            >
              {chip.icon} {chip.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
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
      </div>
    </form>
  );
}
