# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A searchable web interface for Texas Ethics Commission (TEC) campaign finance data. Allows users to search contributions, expenditures, filers, and reports with advanced boolean query building capabilities.

**Live URL:** https://tec.joshuaru.sh

## Tech Stack

- **Frontend:** Astro 5 + React 19 + Tailwind CSS v4
- **Database:** DuckDB-WASM (in-browser SQL engine)
- **Data Storage:** Parquet files on Cloudflare R2 CDN (`tec-data.joshuaru.sh`)
- **Caching:** Browser IndexedDB for persistent local storage
- **Hosting:** Cloudflare Pages
- **Charts:** Recharts

## Commands

```bash
bun run dev          # Start dev server at localhost:4321
bun run build        # Build static site (astro check + astro build)
bun run preview      # Preview production build locally
bunx wrangler pages deploy dist  # Deploy to Cloudflare Pages
```

## Architecture

### Client-Side Database

The app uses DuckDB-WASM to run SQL queries entirely in the browser. No backend server is needed for data queries.

**Data Flow:**
1. On first visit, Parquet files are downloaded from R2 CDN (~290MB total)
2. Files are cached in IndexedDB for future visits
3. DuckDB loads the cached files and creates in-memory tables
4. All queries run locally with zero network latency

**Parquet Files** (at `https://tec-data.joshuaru.sh`):
- `filers.parquet` (380 KB) - ~2,800 candidate/PAC records
- `reports.parquet` (7.5 MB) - ~95K campaign finance reports
- `expenditures.parquet` (86 MB) - ~1.5M spending transactions
- `contributions_2020.parquet` (210 MB) - ~8-10M donation records (2020+)

### Key Files

**`src/lib/duckdb.ts`** - Main database client with all query functions:
- `query<T>(sql)` - Execute raw SQL
- `searchContributions/searchFilers/searchExpenditures` - Search with filters
- `getFilerById`, `getLatestReport`, `getTopDonors` - Candidate profile data
- `getTimelineData`, `getReportTimeline` - Chart data aggregations
- `waitForInit()` - Promise that resolves when DB is ready
- `clearCache()`, `getCacheInfo()` - Cache management

**`src/lib/parquet-cache.ts`** - IndexedDB caching:
- `downloadWithProgress(url, onProgress)` - Fetch with progress callbacks
- `getCachedFile/setCachedFile` - Retrieve/store from browser cache

**`src/lib/supabase.ts`** - Legacy client for party_tags table only (user-submitted party affiliations)

### Date Format

Dates are stored as 8-digit integers (YYYYMMDD):
- Example: `20241215` = December 15, 2024
- Use DuckDB's `make_date()` for conversions

## Key Technical Decisions

### Tailwind CSS v4
Uses the new `@theme` directive for custom colors:
```css
@import "tailwindcss";
@theme {
  --color-texas-blue: #002868;
  --color-texas-red: #BF0D3E;
}
```

### Static Site Generation
Astro builds static HTML. All data fetching happens client-side via React components with `client:load` directive.

### Candidate Pages
Uses query params (`/candidate?id=XXX`) instead of dynamic routes because static output mode requires `getStaticPaths()`.

### Performance
- **First load:** 30-60 seconds (downloads ~290MB, caches locally)
- **Cached loads:** <1 second (from IndexedDB)
- **Query speed:** <100ms (in-browser, no network)

## Query Builder Features

The QueryBuilder component (`/query-builder`) supports:
- Boolean AND/OR condition groups (nestable)
- 4 data sources: contributions, expenditures, filers, reports
- 12+ operators: equals, contains, starts_with, between, regex, in_list, etc.
- Aggregations: GROUP BY with SUM, COUNT, AVG, MIN, MAX
- CSV export of results
