# Expenditure Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class expenditure search, payee lookup, and profile spending/ledger views while keeping statewide all-transactions browsing hidden.

**Architecture:** Extend the existing DuckDB search layer with expenditure and filer-scoped ledger helpers, share table column definitions across search/profile screens, and add focused React/Astro surfaces for Payee Search and profile transaction tabs. Keep `/advanced` as List Builder with contribution/expenditure modes.

**Tech Stack:** Astro 5, React 19, TypeScript, DuckDB-WASM, Bun test/build.

---

### Task 1: Shared Transaction Table Helpers

**Files:**
- Create: `src/lib/transaction-columns.tsx`
- Test: `src/lib/transaction-columns.test.tsx`

- [ ] Add failing tests for contribution, expenditure, and ledger CSV column keys.
- [ ] Implement shared `CONTRIBUTION_COLUMNS`, `EXPENDITURE_COLUMNS`, and `LEDGER_COLUMNS`.
- [ ] Run `bun test src/lib/transaction-columns.test.tsx`.

### Task 2: DuckDB Query Helpers

**Files:**
- Modify: `src/lib/duckdb.ts`
- Modify: `src/lib/search.ts`

- [ ] Add typed `LedgerTransaction` and richer expenditure filter fields.
- [ ] Add `getExpendituresForFilerFull`.
- [ ] Add `getLedgerForFilerFull`.
- [ ] Export new helpers and types from `src/lib/search.ts`.
- [ ] Verify with `bun run build`.

### Task 3: Payee Search

**Files:**
- Create: `src/components/PayeeSearch.tsx`
- Create: `src/pages/search/payees.astro`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/index.astro`

- [ ] Build Payee Search as a sibling to Contributor Search with payee-specific copy, expenditure columns, sorting, filters, and CSV export.
- [ ] Add `/search/payees`.
- [ ] Add Payees to header and homepage browse/quick-action areas.
- [ ] Verify `/search/payees` renders under dev server.

### Task 4: Profile Transaction Tabs

**Files:**
- Modify: `src/components/CandidateProfile.tsx`

- [ ] Add `Contributions`, `Expenditures`, and `Ledger` tabs.
- [ ] Load expenditures and ledger rows using the profile date range.
- [ ] Keep independent sort state per tab.
- [ ] Make CSV export active-tab aware.
- [ ] Add expenditure count to profile stats.

### Task 5: List Builder and Hidden Transactions Page

**Files:**
- Modify: `src/components/AdvancedSearch.tsx`
- Modify: `src/pages/search/transactions.astro`

- [ ] Convert List Builder transaction type controls to tab-like buttons for Contributions and Expenditures.
- [ ] Preserve mode-specific filters and mode-specific CSV export.
- [ ] Replace the broken hidden transactions page with a simple handoff to List Builder/payee/donor searches.

### Task 6: Verification, Commit, Push

**Files:**
- All changed files

- [ ] Run `bun test`.
- [ ] Run `bun run build`.
- [ ] Run a quick browser/dev-server smoke check.
- [ ] Stage only files changed for this feature.
- [ ] Commit with a concise feature message.
- [ ] Push to `origin main`.
