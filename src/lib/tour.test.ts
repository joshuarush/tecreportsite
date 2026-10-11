import { describe, expect, test } from 'bun:test';
import { shouldAutoOpenTour, tourSearchUrl } from './tour';

describe('first-visit tour', () => {
  test('opens on a first visit only', () => {
    expect(shouldAutoOpenTour(null, '')).toBe(true);
    expect(shouldAutoOpenTour('done', '')).toBe(false);
    expect(shouldAutoOpenTour('dismissed', '?q=abbott')).toBe(false);
  });

  test('?tour= overrides stored state', () => {
    expect(shouldAutoOpenTour('done', '?tour=1')).toBe(true);
    expect(shouldAutoOpenTour(null, '?tour=0')).toBe(false);
  });

  test('builds deep links into each search', () => {
    expect(tourSearchUrl('donor', ' Bob Perry ')).toBe('/search/contributors/?q=Bob%20Perry');
    expect(tourSearchUrl('committee', 'Abbott')).toBe('/search/committees/?q=Abbott');
    expect(tourSearchUrl('payee', '')).toBe('/search/payees/');
  });
});
