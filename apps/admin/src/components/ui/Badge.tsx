const RISK_STYLES: Record<string, string> = {
  low: 'bg-emerald-50 text-emerald-600',
  medium: 'bg-amber-50 text-amber-600',
  high: 'bg-red-50 text-red-500',
  critical: 'bg-red-100 text-red-700 font-bold',
};

interface BadgeProps {
  value: string;
  variant?: 'risk' | 'mode' | 'emotion';
}

export default function Badge({ value, variant = 'risk' }: BadgeProps) {
  let cls = 'bg-neutral-100 text-neutral-600';
  if (variant === 'risk' && RISK_STYLES[value]) {
    cls = RISK_STYLES[value];
  }
  if (variant === 'mode') {
    cls = 'bg-primary-50 text-primary-600';
  }
  if (variant === 'emotion') {
    cls = 'bg-violet-50 text-violet-600';
  }

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap ${cls}`}
    >
      {value}
    </span>
  );
}
