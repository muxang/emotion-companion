/**
 * 极简 Markdown 解析：仅支持
 *  - **bold**  → <strong>
 *  - 换行 \n  → <br />
 *
 * 不引入任何依赖，先转义 HTML 再做替换，避免 XSS。
 */

export interface MdNode {
  type: 'text' | 'bold' | 'br';
  value?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 将文本解析为节点数组，方便 React 渲染
 */
export function parseMiniMarkdown(text: string): MdNode[] {
  if (!text) return [];
  const nodes: MdNode[] = [];
  // 拆分加粗
  const boldRe = /\*\*([\s\S]+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = boldRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushTextWithBr(nodes, text.slice(lastIndex, match.index));
    }
    nodes.push({ type: 'bold', value: match[1] });
    lastIndex = boldRe.lastIndex;
  }
  if (lastIndex < text.length) {
    pushTextWithBr(nodes, text.slice(lastIndex));
  }
  return nodes;
}

function pushTextWithBr(nodes: MdNode[], chunk: string): void {
  const parts = chunk.split('\n');
  parts.forEach((p, i) => {
    if (p.length > 0) nodes.push({ type: 'text', value: p });
    if (i < parts.length - 1) nodes.push({ type: 'br' });
  });
}

/**
 * 转 HTML 字符串（已对原文本做转义），主要用于测试或 SSR
 */
export function renderMiniMarkdown(text: string): string {
  return parseMiniMarkdown(text)
    .map((n) => {
      if (n.type === 'br') return '<br />';
      if (n.type === 'bold') return `<strong>${escapeHtml(n.value ?? '')}</strong>`;
      return escapeHtml(n.value ?? '');
    })
    .join('');
}
