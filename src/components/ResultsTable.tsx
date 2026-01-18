import { formatCurrency, formatDate } from '../lib/search';
import type { Contribution, Filer, Expenditure } from '../lib/supabase';

interface ContributionsTableProps {
  type: 'contributions';
  data: Contribution[];
  loading?: boolean;
}

interface FilersTableProps {
  type: 'filers';
  data: Filer[];
  loading?: boolean;
}

interface ExpendituresTableProps {
  type: 'expenditures';
  data: Expenditure[];
  loading?: boolean;
}

type ResultsTableProps = ContributionsTableProps | FilersTableProps | ExpendituresTableProps;

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-200 rounded w-3/4"></div>
        </td>
      ))}
    </tr>
  );
}

export default function ResultsTable(props: ResultsTableProps) {
  const { type, data, loading } = props;

  if (type === 'contributions') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="px-4 py-3 text-sm font-semibold text-slate-900">Contributor</th>
              <th className="px-4 py-3 text-sm font-semibold text-slate-900">Recipient</th>
              <th className="px-4 py-3 text-sm font-semibold text-slate-900 text-right">Amount</th>
              <th className="px-4 py-3 text-sm font-semibold text-slate-900">Date</th>
              <th className="px-4 py-3 text-sm font-semibold text-slate-900 hidden md:table-cell">Location</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <>
                <LoadingRow cols={5} />
                <LoadingRow cols={5} />
                <LoadingRow cols={5} />
              </>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  No contributions found. Try adjusting your search criteria.
                </td>
              </tr>
            ) : (
              (data as Contribution[]).map((contribution) => (
                <tr key={contribution.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 text-sm">
                      {contribution.contributor_name || 'Unknown'}
                    </div>
                    {contribution.contributor_employer && (
                      <div className="text-xs text-slate-500">
                        {contribution.contributor_employer}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/candidate?id=${contribution.filer_id}`}
                      className="text-sm text-texas-blue hover:text-blue-700"
                    >
                      {contribution.filer_name || contribution.filer_id}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-medium text-green-700 text-sm">
                      {formatCurrency(contribution.amount)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatDate(contribution.date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">
                    {contribution.contributor_city}
                    {contribution.contributor_state && `, ${contribution.contributor_state}`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'filers') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="px-4 py-3 text-sm font-semibold text-slate-900">Name</th>
              <th className="px-4 py-3 text-sm font-semibold text-slate-900">Type</th>
              <th className="px-4 py-3 text-sm font-semibold text-slate-900">Office</th>
              <th className="px-4 py-3 text-sm font-semibold text-slate-900">Party</th>
              <th className="px-4 py-3 text-sm font-semibold text-slate-900">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <>
                <LoadingRow cols={5} />
                <LoadingRow cols={5} />
                <LoadingRow cols={5} />
              </>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  No filers found. Try adjusting your search criteria.
                </td>
              </tr>
            ) : (
              (data as Filer[]).map((filer) => (
                <tr key={filer.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <a
                      href={`/candidate?id=${filer.id}`}
                      className="font-medium text-texas-blue hover:text-blue-700 text-sm"
                    >
                      {filer.name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {filer.type || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {filer.office_held || '—'}
                    {filer.office_district && ` - District ${filer.office_district}`}
                  </td>
                  <td className="px-4 py-3">
                    {filer.party && (
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                        filer.party === 'REPUBLICAN' ? 'bg-red-100 text-red-800' :
                        filer.party === 'DEMOCRAT' ? 'bg-blue-100 text-blue-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {filer.party}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {filer.status || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // Expenditures table
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th className="px-4 py-3 text-sm font-semibold text-slate-900">Payer</th>
            <th className="px-4 py-3 text-sm font-semibold text-slate-900">Payee</th>
            <th className="px-4 py-3 text-sm font-semibold text-slate-900 text-right">Amount</th>
            <th className="px-4 py-3 text-sm font-semibold text-slate-900">Date</th>
            <th className="px-4 py-3 text-sm font-semibold text-slate-900 hidden md:table-cell">Category</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <>
              <LoadingRow cols={5} />
              <LoadingRow cols={5} />
              <LoadingRow cols={5} />
            </>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                No expenditures found. Try adjusting your search criteria.
              </td>
            </tr>
          ) : (
            (data as Expenditure[]).map((expenditure) => (
              <tr key={expenditure.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <a
                    href={`/candidate?id=${expenditure.filer_id}`}
                    className="text-sm text-texas-blue hover:text-blue-700"
                  >
                    {expenditure.filer_name || expenditure.filer_id}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 text-sm">
                    {expenditure.payee_name || 'Unknown'}
                  </div>
                  {expenditure.description && (
                    <div className="text-xs text-slate-500 truncate max-w-xs">
                      {expenditure.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-medium text-texas-red text-sm">
                    {formatCurrency(expenditure.amount)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {formatDate(expenditure.date)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">
                  {expenditure.category || '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
