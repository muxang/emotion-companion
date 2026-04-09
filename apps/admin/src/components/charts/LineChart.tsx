import {
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface LineChartProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Array<Record<string, any>>;
  xKey: string;
  yKey: string;
  title?: string;
  color?: string;
  yFormatter?: (v: number) => string;
}

export default function LineChart({
  data,
  xKey,
  yKey,
  title,
  color = '#6366f1',
  yFormatter,
}: LineChartProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      {title && (
        <h3 className="mb-4 text-sm font-medium text-neutral-600">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <RLineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} stroke="#a3a3a3" />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#a3a3a3"
            tickFormatter={yFormatter}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #e5e5e5',
              fontSize: 13,
            }}
            formatter={yFormatter ? (v: number) => yFormatter(v) : undefined}
          />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}
