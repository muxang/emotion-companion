import type { ChatViewMessage } from '../../stores/chatStore.js';
import { formatHm } from '../../utils/time.js';
import { parseMiniMarkdown } from '../../utils/markdown.js';
import { ActionCardRenderer } from '../cards/ActionCardRenderer.js';

export interface MessageBubbleProps {
  message: ChatViewMessage;
  /** 是否显示时间戳（同一分钟内的连续消息会被去重隐藏） */
  showTimestamp?: boolean;
  /** plan_options 卡片选择后向对话发送一条消息 */
  onPlanOptionSelect?: (message: string) => void;
}

/**
 * 三点跳动动画。streaming 期间 AI 还没产出第一个字符时显示，
 * 让用户明确感知到"模型正在思考"。
 */
function TypingDots(): JSX.Element {
  return (
    <span
      className="inline-flex items-end gap-1 py-1"
      aria-label="正在输入"
      data-testid="typing-dots"
    >
      <span
        className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-300"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-300"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-300"
        style={{ animationDelay: '300ms' }}
      />
    </span>
  );
}

function renderAssistantContent(text: string): JSX.Element {
  const nodes = parseMiniMarkdown(text);

  // 按 'para' 节点把 nodes 分组成段落
  const paragraphs: typeof nodes[number][][] = [[]];
  for (const node of nodes) {
    if (node.type === 'para') {
      paragraphs.push([]);
    } else {
      paragraphs[paragraphs.length - 1].push(node);
    }
  }

  // 过滤掉空段落（例如文本以 \n\n 结尾时产生的空尾段）
  const nonEmpty = paragraphs.filter((p) => p.length > 0);

  return (
    <>
      {nonEmpty.map((paraNodes, pIdx) => (
        <p
          key={pIdx}
          className={pIdx < nonEmpty.length - 1 ? 'mb-3' : ''}
        >
          {paraNodes.map((n, nIdx) => {
            if (n.type === 'br') return <br key={nIdx} />;
            if (n.type === 'bold') return <strong key={nIdx}>{n.value}</strong>;
            if (n.type === 'text') return <span key={nIdx}>{n.value}</span>;
            return null; // 'para' 已在分组阶段排除，此分支理论上不可达
          })}
        </p>
      ))}
    </>
  );
}

/** 见证分隔符 */
const WITNESS_SEPARATOR = '\n\n· · ·\n\n';

export function MessageBubble({
  message,
  showTimestamp = true,
  onPlanOptionSelect,
}: MessageBubbleProps): JSX.Element {
  const isUser = message.role === 'user';

  // 拆分主回复 vs 见证内容
  const hasWitness =
    !isUser && message.content && message.content.includes(WITNESS_SEPARATOR);
  const mainContent = hasWitness
    ? message.content.split(WITNESS_SEPARATOR)[0] ?? ''
    : message.content;
  const witnessContent = hasWitness
    ? message.content.split(WITNESS_SEPARATOR).slice(1).join(WITNESS_SEPARATOR)
    : null;

  return (
    <div className={`flex w-full flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={[
          'max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-3 shadow-sm',
          isUser
            ? 'bg-primary-500 text-[15px] leading-[1.7] text-white'
            : 'border border-neutral-200 bg-white text-[15px] leading-[1.8] text-neutral-800',
        ].join(' ')}
      >
        {isUser ? (
          message.content || (message.streaming ? '…' : '')
        ) : mainContent ? (
          renderAssistantContent(mainContent)
        ) : message.streaming ? (
          <TypingDots />
        ) : (
          ''
        )}
        {message.streaming && message.content ? (
          <span className="ml-0.5 inline-block w-1 animate-pulse">▍</span>
        ) : null}
      </div>
      {witnessContent ? (
        <div className="mt-2 w-full max-w-[75%]">
          <div className="flex items-center gap-2 px-1">
            <span className="text-[11px] tracking-widest text-neutral-300">
              · · ·
            </span>
          </div>
          {witnessContent.includes('今天说的：') ? (
            <SummaryCardBlock text={witnessContent} />
          ) : (
            <div className="mt-1 rounded-r-lg border-l-2 border-primary-200 bg-primary-50/40 px-3 py-2.5 text-[13px] leading-relaxed text-neutral-500">
              {witnessContent}
            </div>
          )}
        </div>
      ) : null}
      {!isUser && message.actionCard ? (
        <div className="mt-2 w-full max-w-[85%]">
          <ActionCardRenderer
            card={message.actionCard}
            onPlanOptionSelect={onPlanOptionSelect}
          />
        </div>
      ) : null}
      {showTimestamp && message.createdAt ? (
        <time
          data-testid="msg-time"
          className="mt-1 px-1 text-[10px] text-neutral-400"
          dateTime={message.createdAt}
        >
          {formatHm(message.createdAt)}
        </time>
      ) : null}
    </div>
  );
}

/**
 * 对话收尾小结卡渲染。
 * 按行解析 "今天说的：" / "情绪：" / "今晚可以做：" / "↩ " 四段。
 */
function SummaryCardBlock({ text }: { text: string }): JSX.Element {
  const lines = text.split('\n').filter((l) => l.length > 0);
  const coreIssue =
    lines.find((l) => l.startsWith('今天说的：'))?.replace('今天说的：', '') ?? '';
  const emotionShift =
    lines.find((l) => l.startsWith('情绪：'))?.replace('情绪：', '') ?? '';
  const oneThing =
    lines.find((l) => !l.startsWith('今天') && !l.startsWith('情绪') && !l.startsWith('↩') && !l.startsWith('今晚') && l.trim().length > 0)
    ?? '';
  const nextQ =
    lines.find((l) => l.startsWith('↩'))?.replace('↩ ', '').replace('↩', '') ?? '';

  return (
    <div className="mt-2 rounded-2xl border border-primary-100 bg-primary-50/40 p-4">
      {coreIssue ? (
        <p className="text-[14px] font-medium leading-relaxed text-neutral-700">
          今天说的：{coreIssue}
        </p>
      ) : null}
      {emotionShift ? (
        <p className="mt-1 text-[13px] text-neutral-500">
          情绪：{emotionShift}
        </p>
      ) : null}
      {oneThing ? (
        <div className="mt-3 rounded-xl border border-neutral-100 bg-white p-3">
          <p className="text-[13px] text-neutral-700">· {oneThing}</p>
        </div>
      ) : null}
      {nextQ ? (
        <div className="mt-3 border-t border-primary-100 pt-3">
          <p className="text-[13px] italic text-primary-400">↩ {nextQ}</p>
        </div>
      ) : null}
    </div>
  );
}
