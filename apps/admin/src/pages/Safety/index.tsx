import { useCallback, useEffect, useState } from 'react';
import { fetchSafetyEvents, type SafetyEvent } from '../../api/safety';
import Table, { type Column } from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';
import { formatDateTime, shortId } from '../../utils/format';

const PAGE_SIZE = 20;
const RISK_OPTIONS = ['全部', 'high', 'critical'] as const;

export default function SafetyPage() {
  const [items, setItems] = useState<SafetyEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [todayCount, setTodayCount] = useState(0);
  const [weekCount, setWeekCount] = useState(0);
  const [riskFilter, setRiskFilter] = useState('全部');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(
    (p: number) => {
      fetchSafetyEvents({
        page: p,
        page_size: PAGE_SIZE,
        risk_level: riskFilter === '全部' ? undefined : riskFilter,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
        .then((res) => {
          setItems(res.items);
          setTotal(res.total);
          setPage(res.page);
          setTodayCount(res.summary.today_count);
          setWeekCount(res.summary.week_count);
        })
        .catch(() => {});
    },
    [riskFilter, dateFrom, dateTo]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const columns: Column<SafetyEvent>[] = [
    {
      key: 'anonymous_id',
      title: '用户ID',
      render: (row) => (
        <span className="font-mono text-xs">{shortId(row.anonymous_id)}</span>
      ),
    },
    {
      key: 'risk_level',
      title: '风险等级',
      render: (row) => <Badge value={row.risk_level} variant="risk" />,
    },
    { key: 'trigger_reason', title: '触发原因' },
    { key: 'action_taken', title: '处理动作' },
    {
      key: 'created_at',
      title: '时间',
      render: (row) => formatDateTime(row.created_at),
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-neutral-800">安全事件</h2>

      {/* summary cards */}
      <div className="flex gap-4">
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4">
          <p className="text-2xl font-bold text-red-600">{todayCount}</p>
          <p className="text-xs text-red-400">今日触发</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4">
          <p className="text-2xl font-bold text-amber-600">{weekCount}</p>
          <p className="text-xs text-amber-400">本周触发</p>
        </div>
      </div>

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
