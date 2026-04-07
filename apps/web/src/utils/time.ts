/**
 * 将 ISO 时间字符串或 Date 格式化为 HH:mm
 */
export function formatHm(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * 判断两个时间是否处于同一分钟（用于消息时间戳去重）
 */
export function isSameMinute(
  a: string | Date | undefined,
  b: string | Date | undefined
): boolean {
  if (!a || !b) return false;
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate() &&
    da.getHours() === db.getHours() &&
    da.getMinutes() === db.getMinutes()
  );
}

/**
 * 截取字符串到指定长度，超出部分用省略号
 */
export function truncate(text: string, max: number): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
