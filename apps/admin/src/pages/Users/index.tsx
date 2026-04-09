import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchUsers, type AdminUserItem } from '../../api/users';
import Table, { type Column } from '../../components/ui/Table';
import Pagination from '../../components/ui/Pagination';
import { formatDateTime, shortId } from '../../utils/format';

const PAGE_SIZE = 20;

export default function UsersPage() {
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(
    (p: number, q: string) => {
      setLoading(true);
      fetchUsers({ page: p, limit: PAGE_SIZE, search: q || undefined })
        .then((res) => {
          setItems(res.items);
          setTotal(res.total);
          setPage(res.page);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    load(1, '');
  }, [load]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    load(1, search);
  }

  const columns: Column<AdminUserItem>[] = [
    {
      key: 'anonymous_id',
      title: '用户ID',
      render: (row) => (
        <span title={row.anonymous_id} className="font-mono text-xs">
          {shortId(row.anonymous_id)}
        </span>
      ),
    },
    {
      key: 'created_at',
      title: '注册时间',
      render: (row) => formatDateTime(row.created_at),
    },
    {
      key: 'last_active_at',
      title: '最后活跃',
      render: (row) => formatDateTime(row.last_active_at),
    },
    { key: 'total_sessions', title: '会话数' },
    { key: 'total_messages', title: '消息数' },
    {
      key: 'memory_enabled',
      title: '记忆开关',
      render: (row) =>
        row.memory_enabled ? (
          <span className="text-emerald-500">开</span>
        ) : (
          <span className="text-neutral-400">关</span>
        ),
    },
    {
      key: 'has_active_plan',
      title: '有计划',
      render: (row) => (row.has_active_plan ? '是' : '-'),
    },
    {
      key: '_action',
      title: '操作',
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/admin/users/${row.id}`);
          }}
          className="text-primary-600 hover:underline"
        >
          查看详情
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-800">用户管理</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="按 anonymous_id 搜索"
            className="w-64 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
          >
            搜索
          </button>
        </form>
      </div>

      {loading && <p className="text-sm text-neutral-400">加载中...</p>}

      <Table
        columns={columns}
        data={items}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/admin/users/${r.id}`)}
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onChange={(p) => load(p, search)}
      />
    </div>
  );
}
