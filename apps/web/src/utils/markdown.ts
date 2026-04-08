/**
 * 极简 Markdown 解析：仅支持
 *  - **bold**  → <strong>
 *  - 换行 \n  → <br />（段内换行）
 *  - 空行 \n\n → 'para' 节点（段落分隔，渲染为带间距的 <p> 包裹）
 *
 * 不引入任何依赖，先转义 HTML 再做替换，避免 XSS。
 */

export type MdNode =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'br' }
  | { type: 'para' };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 在一个段落内（不含 \n\n）把 \n 拆成 br 节点，文字部分拆成 text 节点。
 */
function pushInlineContent(nodes: MdNode[], chunk: string): void {
  const parts = chunk.split('\n');
  parts.forEach((p, i) => {
    if (p.length > 0) nodes.push({ type: 'text', value: p });
    if (i < parts.length - 1) nodes.push({ type: 'br' });
  });
}

/**
 * 把一个段落字符串（已按 \n\n 分割）解析为含 bold / text / br 的节点数组。
 */
function parseParagraph(para: string): MdNode[] {
  const nodes: MdNode[] = [];
  const boldRe = /\*\*([\s\S]+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = boldRe.exec(para)) !== null) {
    if (match.index > lastIndex) {
      pushInlineContent(nodes, para.slice(lastIndex, match.index));
    }
    nodes.push({ type: 'bold', value: match[1] });
    lastIndex = boldRe.lastIndex;
  }
  if (lastIndex < para.length) {
    pushInlineContent(nodes, para.slice(lastIndex));
  }
  return nodes;
}

/**
 * 将文本解析为节点数组，方便 React 渲染。
 * \n\n → 'para' 节点（段落分隔）
 * \n   → 'br' 节点（段内换行）
 */
export function parseMiniMarkdown(text: string): MdNode[] {
  if (!text) return [];
  const paragraphs = text.split('\n\n');
  const allNodes: MdNode[] = [];
  paragraphs.forEach((para, pIdx) => {
    if (para.length > 0) {
      allNodes.push(...parseParagraph(para));
    }
    if (pIdx < paragraphs.length - 1) {
      allNodes.push({ type: 'para' });
    }
  });
  return allNodes;
}

/**
 * 转 HTML 字符串（已对原文本做转义），主要用于测试或 SSR
 */
export function renderMiniMarkdown(text: string): string {
  return parseMiniMarkdown(text)
    .map((n) => {
      if (n.type === 'br') return '<br />';
      if (n.type === 'para') return '<p />';
      if (n.type === 'bold') return `<strong>${escapeHtml(n.value ?? '')}</strong>`;
      return escapeHtml(n.value ?? '');
    })
    .join('');
}
