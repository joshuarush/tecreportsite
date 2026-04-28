import { describe, expect, test } from 'bun:test';
import {
  CONTRIBUTION_COLUMNS,
  EXPENDITURE_COLUMNS,
  LEDGER_COLUMNS,
} from './transaction-columns';

describe('transaction table columns', () => {
  test('defines stable contribution CSV/display columns', () => {
    expect(CONTRIBUTION_COLUMNS.map(column => column.key)).toEqual([
      'contributor_name',
      'filer_name',
      'amount',
      'date',
      'contributor_city',
    ]);
  });

  test('defines stable expenditure CSV/display columns', () => {
    expect(EXPENDITURE_COLUMNS.map(column => column.key)).toEqual([
      'filer_name',
      'payee_name',
      'amount',
      'date',
      'category',
    ]);
  });

  test('defines stable profile ledger columns', () => {
    expect(LEDGER_COLUMNS.map(column => column.key)).toEqual([
      'date',
      'direction',
      'name',
      'filer_name',
      'amount',
      'description',
    ]);
  });
});
