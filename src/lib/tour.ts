// First-visit tour state. Kept free of React so the open/close rules are
// easy to test.

export const TOUR_STORAGE_KEY = 'armadollar:tour:v1';

export type TourSearchKind = 'donor' | 'committee' | 'payee';

export const TOUR_SEARCH_ROUTES: Record<TourSearchKind, string> = {
  donor: '/search/contributors/',
  committee: '/search/committees/',
  payee: '/search/payees/',
};

/**
 * Decide whether the tour opens on its own. `?tour=1` forces it open (handy
 * for sharing), `?tour=0` suppresses it, otherwise it opens once per browser.
 */
export function shouldAutoOpenTour(stored: string | null, search: string): boolean {
  const param = new URLSearchParams(search).get('tour');
  if (param === '1') return true;
  if (param === '0') return false;
  return stored === null;
}

export function tourSearchUrl(kind: TourSearchKind, query: string): string {
  const q = query.trim();
  const base = TOUR_SEARCH_ROUTES[kind];
  return q ? `${base}?q=${encodeURIComponent(q)}` : base;
}

// Storage can throw (private mode, blocked site data); the tour must still work.
export function readTourState(): string | null {
  try {
    return window.localStorage.getItem(TOUR_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeTourState(value: 'done' | 'dismissed'): void {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, value);
  } catch {
    // Without storage the tour may show again next visit; that's acceptable.
  }
}
