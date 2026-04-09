import {
  PieChart as RPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#a78bfa',
  '#c4b5fd',
  '#ddd6fe',
  '#818cf8',
  '#4f46e5',
  '#312e81',
];

interface PieChartProps {
  data: Array<{ name: string; value: number }>;
  title?: string;
}

export default function PieChart({ data, title }: PieChartProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      {title && (
        <h3 className="mb-4 text-sm font-medium text-neutral-600">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <RPieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={90}
            innerRadius={45}
            paddingAngle={2}
          >
            {data.map((_entry, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #e5e5e5',
              fontSize: 13,
            }}
          />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        </RPieChart>
      </ResponsiveContainer>
    </div>
  );
}
