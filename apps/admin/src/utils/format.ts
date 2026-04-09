function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return '-';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return '-';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '-';
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${(value * 100).toFixed(digits)}%`;
}

export function shortId(id: string | null | undefined, length = 8): string {
  if (!id) return '-';
  return id.length <= length ? id : id.slice(0, length);
}

export function truncate(text: string | null | undefined, length = 50): string {
  if (!text) return '';
  return text.length <= length ? text : `${text.slice(0, length)}...`;
}

export function diffPercent(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 1;
  return (current - previous) / previous;
}
