import {
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface BarChartProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Array<Record<string, any>>;
  xKey: string;
  yKey: string;
  title?: string;
  color?: string;
}

export default function BarChart({
  data,
  xKey,
  yKey,
  title,
  color = '#6366f1',
}: BarChartProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      {title && (
        <h3 className="mb-4 text-sm font-medium text-neutral-600">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <RBarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} stroke="#a3a3a3" />
          <YAxis tick={{ fontSize: 12 }} stroke="#a3a3a3" />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #e5e5e5',
              fontSize: 13,
            }}
          />
          <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
