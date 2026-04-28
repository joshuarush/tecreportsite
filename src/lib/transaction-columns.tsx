import type { Column } from '../components/DataTable';
import {
  formatCurrency,
  formatDate,
  type Contribution,
  type Expenditure,
  type LedgerTransaction,
} from './duckdb';

export const CONTRIBUTION_COLUMNS: Column<Contribution>[] = [
  {
    key: 'contributor_name',
    header: 'Contributor',
    render: (row) => (
      <div>
        <a
          href={`/search/contributors?q=${encodeURIComponent(row.contributor_name || '')}${row.contributor_city ? `&city=${encodeURIComponent(row.contributor_city)}` : ''}`}
          className="font-medium text-texas-blue hover:text-blue-700 text-sm block"
        >
          {row.contributor_name || 'Unknown'}
        </a>
        {row.contributor_employer && (
          <div className="text-xs text-slate-500">{row.contributor_employer}</div>
        )}
      </div>
    ),
  },
  {
    key: 'filer_name',
    header: 'Recipient',
    render: (row) => (
      <a href={`/candidate?id=${row.filer_id}`} className="text-sm text-texas-blue hover:text-blue-700">
        {row.filer_name || row.filer_id}
      </a>
    ),
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: (row) => <span className="font-medium text-green-700 text-sm">{formatCurrency(row.amount)}</span>,
  },
  {
    key: 'date',
    header: 'Date',
    render: (row) => <span className="text-slate-600">{formatDate(row.date)}</span>,
  },
  {
    key: 'contributor_city',
    header: 'Location',
    hidden: 'mobile',
    render: (row) => (
      <span className="text-slate-600">
        {row.contributor_city}
        {row.contributor_state && `, ${row.contributor_state}`}
      </span>
    ),
  },
];

export const EXPENDITURE_COLUMNS: Column<Expenditure>[] = [
  {
    key: 'filer_name',
    header: 'Payer',
    render: (row) => (
      <a href={`/candidate?id=${row.filer_id}`} className="text-sm text-texas-blue hover:text-blue-700">
        {row.filer_name || row.filer_id}
      </a>
    ),
  },
  {
    key: 'payee_name',
    header: 'Payee',
    render: (row) => (
      <div>
        <a
          href={`/search/payees?q=${encodeURIComponent(row.payee_name || '')}${row.payee_city ? `&city=${encodeURIComponent(row.payee_city)}` : ''}`}
          className="font-medium text-texas-blue hover:text-blue-700 text-sm block"
        >
          {row.payee_name || 'Unknown'}
        </a>
        {row.description && <div className="text-xs text-slate-500 truncate max-w-xs">{row.description}</div>}
      </div>
    ),
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: (row) => <span className="font-medium text-texas-red text-sm">{formatCurrency(row.amount)}</span>,
  },
  {
    key: 'date',
    header: 'Date',
    render: (row) => <span className="text-slate-600">{formatDate(row.date)}</span>,
  },
  {
    key: 'category',
    header: 'Category',
    hidden: 'mobile',
    render: (row) => <span className="text-slate-600">{row.category || '—'}</span>,
  },
];

export const LEDGER_COLUMNS: Column<LedgerTransaction>[] = [
  {
    key: 'date',
    header: 'Date',
    render: (row) => <span className="text-slate-600">{formatDate(row.date)}</span>,
  },
  {
    key: 'direction',
    header: 'Direction',
    render: (row) => (
      <span
        className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
          row.direction === 'in'
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        }`}
      >
        {row.direction === 'in' ? 'Received' : 'Spent'}
      </span>
    ),
  },
  {
    key: 'name',
    header: 'Name',
    render: (row) => (
      <span className="font-medium text-slate-900 text-sm">
        {row.name || 'Unknown'}
      </span>
    ),
  },
  {
    key: 'filer_name',
    header: 'Committee',
    hidden: 'mobile',
    render: (row) => (
      <a href={`/candidate?id=${row.filer_id}`} className="text-sm text-texas-blue hover:text-blue-700">
        {row.filer_name || row.filer_id}
      </a>
    ),
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: (row) => (
      <span className={`font-medium text-sm ${row.direction === 'in' ? 'text-green-700' : 'text-texas-red'}`}>
        {formatCurrency(row.amount)}
      </span>
    ),
  },
  {
    key: 'description',
    header: 'Description',
    hidden: 'mobile',
    render: (row) => <span className="text-slate-600">{row.description || row.category || '—'}</span>,
  },
];
