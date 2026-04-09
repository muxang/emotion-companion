interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export default function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-between pt-4 text-sm">
      <span className="text-neutral-400">
        共 {total} 条，第 {page}/{totalPages} 页
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded-lg px-3 py-1.5 transition disabled:opacity-30 hover:bg-neutral-100"
        >
          上一页
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`min-w-[36px] rounded-lg px-2 py-1.5 transition ${
              p === page
                ? 'bg-primary-600 text-white'
                : 'hover:bg-neutral-100 text-neutral-600'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="rounded-lg px-3 py-1.5 transition disabled:opacity-30 hover:bg-neutral-100"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
