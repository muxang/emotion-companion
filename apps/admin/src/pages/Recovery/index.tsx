import { useEffect, useState } from 'react';
import { fetchRecovery, type RecoveryListResponse } from '../../api/recovery';
import StatCard from '../../components/ui/StatCard';
import PieChart from '../../components/charts/PieChart';
import LineChart from '../../components/charts/LineChart';
import Table, { type Column } from '../../components/ui/Table';
import Pagination from '../../components/ui/Pagination';
import { formatDate, formatPercent, shortId } from '../../utils/format';
import type { RecoveryPlanItem } from '../../api/recovery';

const PAGE_SIZE = 20;

export default function RecoveryPage() {
  const [data, setData] = useState<RecoveryListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  function load(p: number) {
    fetchRecovery({ page: p, page_size: PAGE_SIZE })
      .then((res) => {
        setData(res);
        setPage(res.page);
      })
      .catch((e: Error) => setError(e.message));
  }

  useEffect(() => {
    load(1);
  }, []);

  if (error) return <p className="py-20 text-center text-red-400">{error}</p>;
  if (!data) return <p className="py-20 text-center text-neutral-400">加载中...</p>;

  const { stats, items, total } = data;

  const columns: Column<RecoveryPlanItem>[] = [
    {
      key: 'anonymous_id',
      title: '用户ID',
      render: (row) => (
        <span className="font-mono text-xs">{shortId(row.anonymous_id)}</span>
      ),
    },
    { key: 'plan_type', title: '计划类型' },
    {
      key: 'progress',
      title: '进度',
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full bg-primary-500"
              style={{ width: `${row.progress * 100}%` }}
            />
          </div>
          <span className="text-xs text-neutral-500">
            {formatPercent(row.progress, 0)}
          </span>
        </div>
      ),
    },
    { key: 'status', title: '状态' },
    {
      key: 'started_at',
      title: '开始时间',
      render: (row) => formatDate(row.started_at),
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-neutral-800">恢复计划</h2>

      {/* stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="总计划数" value={stats.total_plans} />
        <StatCard label="进行中" value={stats.in_progress} />
        <StatCard label="已完成" value={stats.completed} />
        <StatCard
          label="整体完成率"
          value={formatPercent(stats.completion_rate)}
        />
      </div>

      {/* charts */}
      <div className="grid grid-cols-2 gap-4">
        <PieChart
          data={stats.type_share.map((t) => ({
            name: t.plan_type,
            value: t.count,
          }))}
          title="计划类型分布"
        />
        <LineChart
          data={stats.daily_checkin_rate.map((d) => ({
            date: d.date,
            rate: d.rate,
          }))}
          xKey="date"
          yKey="rate"
          title="最近14天每日打卡率"
          color="#8b5cf6"
          yFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
        />
      </div>

      {/* table */}
      <Table
        columns={columns}
        data={items}
        rowKey={(r) => r.id}
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
