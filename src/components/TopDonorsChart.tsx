import { formatCurrency } from '../lib/search';

interface TopDonor {
  name: string;
  total: number;
  count: number;
}

interface TopDonorsChartProps {
  donors: TopDonor[];
  title?: string;
}

export default function TopDonorsChart({ donors, title = 'Top Donors' }: TopDonorsChartProps) {
  if (donors.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
        <p className="text-slate-500 text-center py-8">No donation data available</p>
      </div>
    );
  }

  // A ranked list rather than a chart: full names stay readable on phones,
  // where a fixed-width axis left almost no room for the bars.
  const max = Math.max(...donors.map(d => d.total), 1);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
      <ol className="space-y-3">
        {donors.map((donor, index) => (
          <li key={`${donor.name}-${index}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <a
                href={`/search/contributors?q=${encodeURIComponent(donor.name)}`}
                className="min-w-0 truncate font-medium text-texas-blue hover:text-blue-700"
                title={donor.name}
              >
                {index + 1}. {donor.name}
              </a>
              <span className="shrink-0 font-semibold text-slate-900 tabular-nums">
                {formatCurrency(donor.total)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-texas-blue"
                  style={{ width: `${Math.max((donor.total / max) * 100, 1)}%` }}
                />
              </div>
              <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                {donor.count.toLocaleString()} gift{donor.count !== 1 ? 's' : ''}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
