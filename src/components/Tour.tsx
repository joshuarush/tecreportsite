import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readTourState,
  shouldAutoOpenTour,
  tourSearchUrl,
  writeTourState,
  type TourSearchKind,
} from '../lib/tour';
import type { InitProgress } from '../lib/duckdb';

// ============================================
// FIRST-VISIT TOUR
// Follows a dollar from donor to committee to payee, which is also how the
// site is organized. Opens once per browser; reopen with any element that
// has [data-open-tour], or with ?tour=1.
// ============================================

const MANIFEST_URL = 'https://tec-data.joshuaru.sh/manifest.json';
const OPEN_EVENT = 'armadollar:open-tour';
const STEP_COUNT = 6;

interface ManifestSummary {
  contributions: number;
  expenditures: number;
  filers: number;
  through: string;
  bytes: number;
}

type DataState =
  | { kind: 'idle' }
  | { kind: 'loading'; percent: number; cached: boolean }
  | { kind: 'ready' }
  | { kind: 'error' };

const compact = (n: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

function formatThrough(yyyymmdd: unknown): string {
  const s = String(yyyymmdd ?? '');
  if (s.length !== 8) return '';
  const d = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STOPS: { key: TourSearchKind; label: string; question: string }[] = [
  { key: 'donor', label: 'Donor', question: 'Who gave' },
  { key: 'committee', label: 'Committee', question: 'Who got it' },
  { key: 'payee', label: 'Payee', question: 'Where it went' },
];

const EXAMPLES: Record<TourSearchKind, string[]> = {
  donor: ['Dunn', 'Perry', 'Smith'],
  committee: ['Abbott', 'Patrick', 'Democratic'],
  payee: ['Printing', 'Facebook', 'Google'],
};

const PLACEHOLDERS: Record<TourSearchKind, string> = {
  donor: 'Name or company',
  committee: 'Candidate or PAC',
  payee: 'Vendor or business',
};

// --------------------------------------------
// Route: three stops with a coin that travels between them
// --------------------------------------------

function Route({ step, onJump }: { step: number; onJump: (step: number) => void }) {
  // Steps 1-3 sit on the stops; the welcome step waits at the start and the
  // last two steps have finished the trip.
  const position = step === 0 ? 0 : Math.min(step - 1, 2);
  const traveled = step === 0 ? 0 : step >= 4 ? 100 : position * 50;

  return (
    <div className="relative mx-auto w-full max-w-sm px-6 pt-1 pb-2" aria-hidden="true">
      <div className="relative h-10">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-white/30" />
        <div
          className="tour-route-fill absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-texas-gold"
          style={{ width: `${traveled}%` }}
        />
        {STOPS.map((stop, i) => {
          const reached = step >= 4 || (step > 0 && i <= position);
          const current = step > 0 && step < 4 && i === position;
          return (
            <button
              key={stop.key}
              type="button"
              tabIndex={-1}
              onClick={() => onJump(i + 1)}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${i * 50}%` }}
            >
              <span
                className={`block h-3.5 w-3.5 rounded-full border-2 transition-colors duration-500 ${
                  reached ? 'border-texas-gold bg-texas-gold' : 'border-white/50 bg-texas-blue'
                } ${current ? 'tour-stop-pulse' : ''}`}
              />
            </button>
          );
        })}
        <div
          className="tour-coin absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${step >= 4 ? 100 : position * 50}%` }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-texas-gold text-[13px] font-bold text-texas-blue shadow-[0_0_0_3px_rgba(212,168,75,0.25),0_4px_14px_rgba(0,0,0,0.35)]">
            $
          </span>
        </div>
      </div>
      <div className="relative h-4 text-[10px] font-semibold uppercase tracking-[0.14em]">
        {STOPS.map((stop, i) => {
          const lit = step >= 4 || (step > 0 && i <= position);
          return (
            <span
              key={stop.key}
              className={`absolute -translate-x-1/2 whitespace-nowrap transition-colors duration-500 ${
                lit ? 'text-texas-gold' : 'text-blue-200/60'
              }`}
              style={{ left: `${i * 50}%` }}
            >
              {stop.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// --------------------------------------------
// Small illustrative mocks (clearly labeled as examples)
// --------------------------------------------

function ExampleTag() {
  return (
    <span className="rounded-full bg-slate-900/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      Example
    </span>
  );
}

function MockRow({
  name,
  sub,
  amount,
  tone,
  delay,
}: {
  name: string;
  sub: string;
  amount: string;
  tone: 'in' | 'out';
  delay: number;
}) {
  return (
    <div
      className="tour-row flex items-center justify-between gap-3 border-t border-slate-200/80 px-3 py-2.5 first:border-t-0"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-texas-blue">{name}</div>
        <div className="truncate text-xs text-slate-500">{sub}</div>
      </div>
      <div
        className={`shrink-0 text-sm font-semibold tabular-nums ${
          tone === 'in' ? 'text-green-700' : 'text-texas-red'
        }`}
      >
        {amount}
      </div>
    </div>
  );
}

function MockSearch({ text, rows }: { text: string; rows: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
        <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
            clipRule="evenodd"
          />
        </svg>
        <span className="tour-typed text-sm font-medium text-slate-800" style={{ ['--chars' as string]: text.length }}>
          {text}
        </span>
        <span className="tour-caret h-4 w-px bg-texas-blue" />
        <span className="ml-auto">
          <ExampleTag />
        </span>
      </div>
      <div>{rows}</div>
    </div>
  );
}

function MockProfile() {
  const [tab, setTab] = useState<'in' | 'out' | 'ledger'>('in');
  const rows = {
    in: [
      ['Maria Gonzales', 'Attorney · San Antonio', '$2,500', 'in'],
      ['Gulf Coast PAC', 'Houston', '$10,000', 'in'],
    ],
    out: [
      ['Lone Star Print Co.', 'Printing · Austin', '$4,180', 'out'],
      ['Hill Country Strategies', 'Consulting', '$12,000', 'out'],
    ],
    ledger: [
      ['Maria Gonzales', 'Received · Sep 12', '$2,500', 'in'],
      ['Lone Star Print Co.', 'Spent · Sep 14', '$4,180', 'out'],
    ],
  } as const;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 px-3 pt-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-900">Friends of Jane Doe</div>
          <div className="text-xs text-slate-500">Candidate · State Rep, HD 00</div>
        </div>
        <ExampleTag />
      </div>
      <div className="grid grid-cols-3 gap-2 px-3 py-3">
        {[
          ['Raised', '$184K', 'text-green-700'],
          ['Spent', '$97K', 'text-texas-red'],
          ['Cash on hand', '$212K', 'text-texas-blue'],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-lg bg-slate-50 px-2 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
            <div className={`text-sm font-bold tabular-nums ${color}`}>{value}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-1 border-y border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Example profile tabs">
        {(
          [
            ['in', 'Contributions'],
            ['out', 'Expenditures'],
            ['ledger', 'Ledger'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-md px-1 py-1.5 text-xs font-semibold transition-colors ${
              tab === key ? 'bg-white text-texas-blue shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div key={tab}>
        {rows[tab].map(([name, sub, amount, tone], i) => (
          <MockRow key={name} name={name} sub={sub} amount={amount} tone={tone} delay={i * 70} />
        ))}
      </div>
    </div>
  );
}

// --------------------------------------------
// Data readiness: the first search downloads the dataset; the tour can start
// that download while people read.
// --------------------------------------------

function DataPrep({
  summary,
  state,
  onPrepare,
}: {
  summary: ManifestSummary | null;
  state: DataState;
  onPrepare: () => void;
}) {
  const size = summary ? `${Math.round(summary.bytes / 1e6)} MB` : 'about 285 MB';

  if (state.kind === 'ready') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
        <svg className="h-5 w-5 shrink-0 text-green-600" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span>Data is on your device. Searches run instantly, even offline.</span>
      </div>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-800">
            {state.cached ? 'Loading saved data…' : 'Downloading records…'}
          </span>
          <span className="font-semibold tabular-nums text-texas-blue">{state.percent}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-texas-blue transition-[width] duration-300"
            style={{ width: `${Math.max(state.percent, 3)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">Keep going. It finishes in the background.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-3">
      <p className="text-sm text-slate-600">
        {state.kind === 'error'
          ? 'The download didn’t finish. You can try again, or it will retry on your first search.'
          : `Your first search downloads ${size} once. After that, everything runs on your device.`}
      </p>
      <button
        type="button"
        onClick={onPrepare}
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-texas-blue hover:text-blue-800"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 3a1 1 0 011 1v7.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V4a1 1 0 011-1zM4 16a1 1 0 100 2h12a1 1 0 100-2H4z"
            clipRule="evenodd"
          />
        </svg>
        {state.kind === 'error' ? 'Try again' : 'Download now while I read'}
      </button>
    </div>
  );
}

// --------------------------------------------
// Main component
// --------------------------------------------

export default function Tour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [summary, setSummary] = useState<ManifestSummary | null>(null);
  const [dataState, setDataState] = useState<DataState>({ kind: 'idle' });
  const [kind, setKind] = useState<TourSearchKind>('donor');
  const [query, setQuery] = useState('');

  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const openTour = useCallback(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setStep(0);
    setDirection(1);
    setOpen(true);
  }, []);

  const closeTour = useCallback((outcome: 'done' | 'dismissed') => {
    writeTourState(outcome);
    setOpen(false);
    returnFocusRef.current?.focus?.();
  }, []);

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(STEP_COUNT - 1, next));
      if (clamped === step) return;
      setDirection(clamped > step ? 1 : -1);
      setStep(clamped);
    },
    [step]
  );

  // Subscribe to DuckDB load progress. Importing the module doesn't start a
  // download; only waitForInit() does.
  const watchData = useCallback(async (start: boolean) => {
    try {
      const db = await import('../lib/duckdb');
      if (!unsubscribeRef.current) {
        unsubscribeRef.current = db.onInitProgressChange((p: InitProgress) => {
          if (p.status === 'ready') setDataState({ kind: 'ready' });
          else if (p.status === 'error') setDataState({ kind: 'error' });
          else if (p.status !== 'idle') {
            setDataState({ kind: 'loading', percent: p.totalProgress ?? 0, cached: p.cached ?? false });
          }
        });
      }
      if (start) {
        setDataState({ kind: 'loading', percent: 0, cached: false });
        await db.waitForInit();
      }
    } catch {
      setDataState({ kind: 'error' });
    }
  }, []);

  // Auto-open once, and let any [data-open-tour] element reopen it
  useEffect(() => {
    let timer: number | undefined;
    if (shouldAutoOpenTour(readTourState(), window.location.search)) {
      timer = window.setTimeout(openTour, 600);
    }
    const onClick = (e: MouseEvent) => {
      const trigger = (e.target as Element | null)?.closest?.('[data-open-tour]');
      if (trigger) {
        e.preventDefault();
        openTour();
      }
    };
    const onEvent = () => openTour();
    document.addEventListener('click', onClick);
    window.addEventListener(OPEN_EVENT, onEvent);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('click', onClick);
      window.removeEventListener(OPEN_EVENT, onEvent);
      unsubscribeRef.current?.();
    };
  }, [openTour]);

  // On open: load headline numbers, and show progress if this page is
  // already loading data (every page except the homepage does).
  useEffect(() => {
    if (!open) return;
    if (!summary) {
      fetch(MANIFEST_URL, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((m) => {
          if (!m?.stats) return;
          setSummary({
            contributions: m.stats.contributions,
            expenditures: m.stats.expenditures,
            filers: m.stats.filers,
            through: formatThrough(m.data_through),
            bytes: (m.files ?? []).reduce((sum: number, f: { size: number }) => sum + (f.size || 0), 0),
          });
        })
        .catch(() => {});
    }
    if (window.location.pathname !== '/') watchData(false);
  }, [open, summary, watchData]);

  // Lock page scroll while open
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  // Move focus to each step's heading so screen readers follow along
  useEffect(() => {
    if (!open) return;
    // Jumping straight into the input on a phone would pop the keyboard over
    // the sheet, so only do that with a real keyboard/mouse.
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const target = step === STEP_COUNT - 1 && finePointer ? inputRef.current : headingRef.current;
    target?.focus({ preventScroll: true });
  }, [open, step]);

  // Keyboard handling runs in the capture phase and stops propagation so
  // page-level single-key shortcuts (the homepage has several) don't fire
  // behind the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      const inInput = e.target instanceof HTMLInputElement;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTour('dismissed');
      } else if (e.key === 'Enter' && inInput) {
        e.preventDefault();
        writeTourState('done');
        window.location.href = tourSearchUrl(kind, (e.target as HTMLInputElement).value);
      } else if (!inInput && e.key === 'ArrowRight') {
        e.preventDefault();
        go(step + 1);
      } else if (!inInput && e.key === 'ArrowLeft') {
        e.preventDefault();
        go(step - 1);
      } else if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([tabindex="-1"]), a[href], input, [tabindex="0"]'
          )
        ).filter((el) => !el.hasAttribute('disabled'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, step, kind, go, closeTour]);

  if (!open) return null;

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(step + (dx < 0 ? 1 : -1));
  };

  const heading = (text: string) => (
    <h2
      ref={headingRef}
      tabIndex={-1}
      id="tour-title"
      className="tour-display text-[1.65rem] leading-[1.1] text-slate-900 outline-none sm:text-[1.9rem]"
    >
      {text}
    </h2>
  );

  const eyebrow = (text: string) => (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-texas-red">{text}</div>
  );

  const lede = (text: React.ReactNode) => <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{text}</p>;

  let body: React.ReactNode;
  switch (step) {
    case 0:
      body = (
        <>
          {eyebrow('Welcome to Armadollar')}
          {heading('Every dollar in Texas politics, searchable.')}
          {lede(
            'Armadollar takes every campaign finance report filed with the Texas Ethics Commission and makes it searchable in seconds. This quick tour follows one dollar from the person who gave it to the business that got paid.'
          )}
          <dl className="mt-5 grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {[
              ['Contributions', summary ? compact(summary.contributions) : '17M+'],
              ['Expenditures', summary ? compact(summary.expenditures) : '4M+'],
              ['Filers', summary ? compact(summary.filers) : '20K+'],
            ].map(([label, value]) => (
              <div key={label} className="px-2 py-3 text-center">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
                <dd className="tour-display mt-0.5 text-xl text-texas-blue tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-center text-xs text-slate-500">
            2020 to present{summary?.through ? `, updated through ${summary.through}` : ''}. Refreshed from TEC twice a day.
          </p>
          <div className="mt-4">
            <DataPrep summary={summary} state={dataState} onPrepare={() => watchData(true)} />
          </div>
        </>
      );
      break;
    case 1:
      body = (
        <>
          {eyebrow('Stop 1 · Who gave')}
          {heading('Look up any donor by name.')}
          {lede(
            'Type part of a name or company. Narrow it down by amount, date, city, employer, or occupation, then export what you find to CSV.'
          )}
          <div className="mt-5">
            <MockSearch
              text="rivera"
              rows={
                <>
                  <MockRow name="Ana Rivera" sub="Teacher · El Paso → Friends of Jane Doe" amount="$250" tone="in" delay={500} />
                  <MockRow name="Rivera Holdings LLC" sub="Dallas → Texans for Progress PAC" amount="$5,000" tone="in" delay={620} />
                  <MockRow name="Luis Rivera" sub="Retired · Laredo → Friends of Jane Doe" amount="$100" tone="in" delay={740} />
                </>
              }
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            <span className="font-semibold text-slate-700">Tip:</span> partial names cast a wide net. Searching
            “rivera” also finds Rivera Holdings LLC.
          </p>
        </>
      );
      break;
    case 2:
      body = (
        <>
          {eyebrow('Stop 2 · Who got it')}
          {heading('Open any candidate or PAC.')}
          {lede(
            'Every profile shows the latest report, cash on hand, and top donors, plus every itemized contribution and expenditure. Tap the tabs below.'
          )}
          <div className="mt-5">
            <MockProfile />
          </div>
        </>
      );
      break;
    case 3:
      body = (
        <>
          {eyebrow('Stop 3 · Where it went')}
          {heading('Follow the spending.')}
          {lede(
            'Search the vendors, consultants, and staff that campaigns pay. Every payment links back to the committee that made it.'
          )}
          <div className="mt-5">
            <MockSearch
              text="print"
              rows={
                <>
                  <MockRow name="Lone Star Print Co." sub="Paid by Friends of Jane Doe · Printing" amount="$4,180" tone="out" delay={500} />
                  <MockRow name="Capitol Printing Inc." sub="Paid by Texans for Progress PAC" amount="$11,920" tone="out" delay={620} />
                  <MockRow name="Bluebonnet Print & Mail" sub="Paid by Committee to Elect Sam Lee" amount="$2,760" tone="out" delay={740} />
                </>
              }
            />
          </div>
        </>
      );
      break;
    case 4:
      body = (
        <>
          {eyebrow('Going further')}
          {heading('Two tools for bigger questions.')}
          <div className="mt-5 space-y-3">
            <a
              href="/advanced"
              className="group block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-texas-blue/40"
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-slate-900">List Builder</span>
                <span className="text-texas-blue transition-transform group-hover:translate-x-0.5">→</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Filter donations or spending across every committee at once by party, office, district, date, and
                amount, then export the list.
              </p>
            </a>
            <a
              href="/query-builder"
              className="group block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-texas-blue/40"
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-slate-900">Expert Mode</span>
                <span className="text-texas-blue transition-transform group-hover:translate-x-0.5">→</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Build AND/OR conditions and total results by donor, committee, or month.
              </p>
            </a>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Amended reports replace the originals automatically, so totals reflect the latest filing.
          </p>
        </>
      );
      break;
    default:
      body = (
        <>
          {eyebrow('Your turn')}
          {heading('What do you want to find?')}
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              writeTourState('done');
              window.location.href = tourSearchUrl(kind, query);
            }}
          >
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1" role="radiogroup" aria-label="Search type">
              {STOPS.map((stop) => (
                <button
                  key={stop.key}
                  type="button"
                  role="radio"
                  aria-checked={kind === stop.key}
                  onClick={() => {
                    setKind(stop.key);
                    inputRef.current?.focus();
                  }}
                  className={`rounded-lg px-2 py-2 text-sm font-semibold transition-all ${
                    kind === stop.key ? 'bg-white text-texas-blue shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {stop.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={PLACEHOLDERS[kind]}
                aria-label={`Search ${kind}s`}
                enterKeyHint="search"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-texas-blue"
              />
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-texas-red px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-red-800"
              >
                Search
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Try</span>
              {EXAMPLES[kind].map((example) => (
                <a
                  key={example}
                  href={tourSearchUrl(kind, example)}
                  onClick={() => writeTourState('done')}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 transition-colors hover:border-texas-blue hover:text-texas-blue"
                >
                  {example}
                </a>
              ))}
            </div>
          </form>
          <p className="mt-5 text-xs text-slate-500">You can reopen this tour anytime from the link at the bottom of every page.</p>
        </>
      );
  }

  const isLast = step === STEP_COUNT - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="tour-backdrop absolute inset-0 bg-[#00142f]/70 backdrop-blur-[3px]"
        onClick={() => closeTour('dismissed')}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="tour-sheet relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-texas-cream shadow-2xl sm:max-h-[min(760px,92dvh)] sm:max-w-[520px] sm:rounded-3xl"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Header band: the route */}
        <div className="tour-band relative shrink-0 bg-texas-blue pb-3 pt-2 text-white">
          <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-white/25 sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between px-4 pb-1">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-200">
              <svg className="h-3 w-3 text-texas-gold" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.5l7.1-.6L12 2z" />
              </svg>
              Follow the money
            </span>
            <button
              type="button"
              onClick={() => closeTour('dismissed')}
              className="-mr-1 rounded-full p-2 text-blue-200 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close tour"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
          <Route step={step} onJump={go} />
        </div>

        {/* Step content */}
        <div className="tour-paper relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-6 sm:px-7">
          <div key={step} className={direction === 1 ? 'tour-step-next' : 'tour-step-prev'}>
            {body}
          </div>
        </div>

        {/* Footer: progress + navigation */}
        <div className="shrink-0 border-t border-slate-900/10 bg-texas-cream px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-7">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5" aria-live="polite">
              <span className="sr-only">
                Step {step + 1} of {STEP_COUNT}
              </span>
              {Array.from({ length: STEP_COUNT }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() => go(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? 'w-6 bg-texas-blue' : i < step ? 'w-1.5 bg-texas-blue/40' : 'w-1.5 bg-slate-300'
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {step === 0 ? (
                <button
                  type="button"
                  onClick={() => closeTour('dismissed')}
                  className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-800"
                >
                  Skip
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => go(step - 1)}
                  className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900"
                >
                  Back
                </button>
              )}
              {isLast ? (
                <button
                  type="button"
                  onClick={() => closeTour('done')}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-400"
                >
                  Explore on my own
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => go(step + 1)}
                  className="rounded-xl bg-texas-blue px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-900"
                >
                  {step === 0 ? 'Show me' : 'Next'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
