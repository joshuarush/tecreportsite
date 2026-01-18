import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatCurrency } from '../lib/search';

interface TimelineData {
  date: string;
  amount: number;
  cumulative: number;
}

interface ContributionTimelineProps {
  data: TimelineData[];
  title?: string;
}

export default function ContributionTimeline({ data, title = 'Fundraising Over Time' }: ContributionTimelineProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
        <p className="text-slate-500 text-center py-8">No timeline data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(date) => {
                const d = new Date(date);
                return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
              }}
            />
            <YAxis
              tickFormatter={(value) => {
                if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
                return `$${value}`;
              }}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(value) => formatCurrency(Number(value) || 0)}
              labelFormatter={(label) => {
                const d = new Date(label);
                return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              }}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 12px',
              }}
            />
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke="#002868"
              strokeWidth={2}
              dot={false}
              name="Total Raised"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
