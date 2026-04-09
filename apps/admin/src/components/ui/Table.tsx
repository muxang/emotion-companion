import { type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  title: string;
  width?: string;
  render?: (row: T, index: number) => ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  highlightRow?: (row: T) => boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function Table<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  onRowClick,
  highlightRow,
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-neutral-400"
              >
                暂无数据
              </td>
            </tr>
          )}
          {data.map((row, idx) => {
            const highlighted = highlightRow?.(row);
            return (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-neutral-100 transition ${
                  onRowClick ? 'cursor-pointer hover:bg-neutral-50' : ''
                } ${highlighted ? 'bg-red-50/50' : ''}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-neutral-700">
                    {col.render
                      ? col.render(row, idx)
                      : String(row[col.key] ?? '-')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
