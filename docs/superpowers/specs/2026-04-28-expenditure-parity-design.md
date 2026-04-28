# Expenditure Search Parity

**Date**: 2026-04-28
**Owner**: Josh
**Goal**: Make expenditures searchable and viewable anywhere the site already makes contributions useful, without promoting a statewide "browse everything" transaction page that does not match real user workflows.

## Product Decisions

- Use matched parallel views for contributions and expenditures.
- Add a dedicated Payee Search page at `/search/payees`, mirroring Donor Search.
- Keep `/advanced` as List Builder and make its transaction type control a real two-tab mode: `Contributions` and `Expenditures`.
- Update candidate and committee profiles with one transaction table area using three tabs: `Contributions`, `Expenditures`, and `Ledger`.
- Keep `/search/transactions` hidden and unpromoted. If a user lands there, it should not have a broken expenditure tab, but it is not a primary navigation destination.
- Add Payees to user-facing navigation near Donors. Do not add or promote "All Transactions" as a main workflow.

## User Workflows

### Donor Search

User can search by contributor name and filter contribution records by date, amount, contributor type, and relevant filer metadata. Existing behavior remains intact.

### Payee Search

User can search by payee/vendor name and filter expenditure records by date, amount, category, payer/filer, and location where available. Results should match Donor Search behavior:

- sortable table
- result count and cap notice
- CSV export
- payer links to candidate/committee profile
- clear empty state

### List Builder

`/advanced` remains the deeper filtered search interface. The existing transaction-type radio control becomes a clearer tab/switch for `Contributions` and `Expenditures`.

Shared filters:

- name search mode
- amount range
- date range
- location
- filer name
- filer type
- office type
- party

Contribution-only filters:

- contributor type
- employer
- occupation
- group by donor

Expenditure-only filters:

- payee name
- category

CSV export must use the active mode's columns and filename.

### Candidate / Committee Profiles

Profile pages should show financial context and itemized records without doubling page length. The profile transaction area uses three tabs:

- `Contributions`: existing contribution table behavior.
- `Expenditures`: payer/payee/category expenditure table behavior.
- `Ledger`: date-sorted combined activity for that filer only.

The ledger is profile-scoped, not statewide. It answers: "What happened in this committee's money flow over time?" It does not try to become a site-wide feed.

CSV export is active-tab aware:

- contribution tab exports contribution columns
- expenditure tab exports expenditure columns
- ledger tab exports ledger columns

## Technical Design

### Data Layer

Extend `src/lib/duckdb.ts` with:

- `getExpendituresForFilerFull(filerId, sort, dateFrom, dateTo, cap)`
- `getLedgerForFilerFull(filerId, sort, dateFrom, dateTo, cap)`
- richer expenditure search filters for payee search

Keep sort allowlists for every public query path. Do not interpolate arbitrary user-provided column names into `ORDER BY`.

Ledger rows should normalize contributions and expenditures into a profile-scoped shape:

- `id`
- `transaction_type`: `contribution` or `expenditure`
- `date`
- `direction`: `in` or `out`
- `name`: contributor or payee
- `counterparty_city`
- `counterparty_state`
- `filer_id`
- `filer_name`
- `amount`
- `category`
- `description`

Default ledger sort is `date DESC`.

### UI Components

Reuse the existing `DataTable` for all result tables.

Create shared transaction column definitions or helpers so the same table language is used across:

- Donor Search
- Payee Search
- List Builder
- Profile tabs

Use a sibling `PayeeSearch` component rather than over-generalizing `ContributorSearch` into a single highly abstract component. The components can share columns, formatters, and query helpers while preserving clearer user-facing copy.

### Pages and Navigation

Add:

- `src/pages/search/payees.astro`

Update:

- `src/layouts/BaseLayout.astro` to include Payees in the top nav.
- `src/pages/index.astro` to include Payee Lookup in Browse / Quick Actions.
- `src/pages/search/transactions.astro` so its expenditure tab is not broken, while keeping it out of primary nav.

### Profile Behavior

`CandidateProfile` should maintain independent sort state for each transaction tab, so switching tabs does not create surprising sort behavior.

The date filter already on the profile should apply to all three transaction tabs and profile stats.

Profile stats should include:

- total contributions
- total expenditures
- contribution count
- expenditure count

The existing report timeline can stay as-is because it already shows both raised and spent from reports.

## Error Handling

- If DuckDB initialization fails, existing `DatabaseLoader` behavior handles the user-facing state.
- If expenditure queries fail, log the error and show the relevant empty/error-safe table state rather than breaking the full profile.
- If ledger results are empty, show a profile-specific empty message.

## Testing and Verification

Run:

- `bun run build`
- `bun test`

Manual checks:

- `/search/payees` loads, searches by payee, sorts, and exports CSV.
- `/advanced` can search contributions and expenditures, with mode-appropriate filters and CSV exports.
- `/candidate?id=<known filer>` shows Contributions, Expenditures, and Ledger tabs.
- Profile date filters affect all three transaction tabs.
- `/search/transactions` no longer has a dead expenditure tab.
- Header/homepage navigation includes Payees but does not promote All Transactions.

## Out of Scope

- A promoted statewide all-transactions browsing page.
- A site-wide ledger feed.
- A broad redesign of Expert Mode.
- Changing the underlying Parquet build process unless a missing column blocks the UI.
