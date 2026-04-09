import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchConversations,
  type ConversationItem,
} from '../../api/conversations';
import Table, { type Column } from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';
import { formatDateTime, shortId, truncate } from '../../utils/format';

const PAGE_SIZE = 20;
const RISK_OPTIONS = ['全部', 'high', 'critical'] as const;
const MODE_OPTIONS = [
  '全部',
  'companion',
  'analysis',
  'coach',
  'recovery',
  'safety',
] as const;

export default function ConversationsPage() {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [riskFilter, setRiskFilter] = useState('全部');
  const [modeFilter, setModeFilter] = useState('全部');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const navigate = useNavigate();

  const load = useCallback(
    (p: number) => {
      fetchConversations({
        page: p,
        page_size: PAGE_SIZE,
        risk_level: riskFilter === '全部' ? undefined : riskFilter,
        mode: modeFilter === '全部' ? undefined : modeFilter,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
        .then((res) => {
          setItems(res.items);
          setTotal(res.total);
          setPage(res.page);
        })
        .catch(() => {});
    },
    [riskFilter, modeFilter, dateFrom, dateTo]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const columns: Column<ConversationItem>[] = [
    {
      key: 'anonymous_id',
      title: '用户ID',
      render: (row) => (
        <span className="font-mono text-xs">{shortId(row.anonymous_id)}</span>
      ),
    },
    {
      key: 'content_preview',
      title: '消息内容',
      render: (row) => (
        <span className="text-neutral-600">{truncate(row.content_preview)}</span>
      ),
    },
    {
      key: 'risk_level',
      title: '风险等级',
      render: (row) => <Badge value={row.risk_level} variant="risk" />,
    },
    {
      key: 'conversation_mode',
      title: '对话模式',
      render: (row) => <Badge value={row.conversation_mode} variant="mode" />,
    },
    {
      key: 'emotion_state',
      title: '情绪状态',
      render: (row) =>
        row.emotion_state ? (
          <Badge value={row.emotion_state} variant="emotion" />
        ) : (
          '-'
        ),
    },
    {
      key: 'created_at',
      title: '时间',
      render: (row) => formatDateTime(row.created_at),
    },
    {
      key: '_action',
      title: '操作',
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/admin/users/${row.user_id}`);
          }}
          className="text-primary-600 hover:underline"
        >
          查看用户
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-neutral-800">对话数据</h2>

      {/* filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs text-neutral-500">
            风险等级
          </label>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            {RISK_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">
            对话模式
          </label>
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            {MODE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">
            开始日期
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">
            结束日期
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <Table
        columns={columns}
        data={items}
        rowKey={(r) => r.id}
        highlightRow={(r) => r.risk_level === 'critical'}
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onChange={load}
      />
    </div>
  );
}
