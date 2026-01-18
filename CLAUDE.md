# CLAUDE.md - Texas Campaign Finance Search

This file provides guidance to Claude Code when working with this codebase.

## Project Overview

A searchable web interface for Texas Ethics Commission (TEC) campaign finance data. Allows users to search contributions, expenditures, filers, and reports with advanced boolean query building capabilities.

**Live URL:** https://tec.joshuaru.sh (also https://tec-campaign-finance.pages.dev)

## Tech Stack

- **Frontend:** Astro 5 + React 19 + Tailwind CSS v4
- **Database:** Supabase (PostgreSQL with pg_trgm for fuzzy search)
- **Hosting:** Cloudflare Pages
- **Charts:** Recharts

## Commands

```bash
# Development
bun run dev          # Start dev server at localhost:4321

# Build & Deploy
bun run build        # Build static site to dist/
bun run preview      # Preview production build locally
bunx wrangler pages deploy dist  # Deploy to Cloudflare Pages

# Database
bunx supabase db push           # Push migrations to Supabase
bunx supabase db diff           # Show diff between local and remote
bunx supabase migration new X   # Create new migration
```

## Project Structure

```
src/
├── components/           # React components (client-side interactive)
│   ├── QueryBuilder.tsx  # Boolean query builder with AND/OR groups
│   ├── AdvancedSearch.tsx # Multi-filter search form
│   ├── ContributorSearch.tsx
│   ├── CandidateSearch.tsx
│   ├── ResultsTable.tsx
│   ├── TopDonorsChart.tsx
│   └── ...
├── layouts/
│   └── BaseLayout.astro  # Main layout with header/footer
├── lib/
│   ├── supabase.ts       # Supabase client + type definitions
│   └── search.ts         # Search functions and utilities
├── pages/
│   ├── index.astro       # Home page
│   ├── advanced.astro    # Advanced search page
│   ├── query-builder.astro # Boolean query builder page
│   ├── candidate.astro   # Candidate profile page (?id=XXX)
│   └── search/
│       ├── contributors.astro
│       ├── candidates.astro
│       └── transactions.astro
└── styles/
    └── global.css        # Tailwind v4 with custom theme

scripts/                  # Python data import scripts
├── import_filers.py
├── import_contributions.py
├── import_expenditures.py
└── import_reports.py

supabase/
└── migrations/           # Database migrations
    ├── 001_initial_schema.sql
    └── 002_drop_fk_constraints.sql
```

## Environment Variables

Create `.env` in project root:

```
PUBLIC_SUPABASE_URL=https://tnrcsazdmdgurjeawamd.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

The Supabase client is lazy-initialized to avoid build-time errors when env vars aren't present.

## Database Schema

Four main tables, all with Row Level Security allowing anonymous read access:

- **filers** - Candidates, PACs, and committees
- **contributions** - Donations received (8-10M records, 2020+)
- **expenditures** - Money spent (1.5M records)
- **reports** - Campaign finance report cover sheets (94K records)

Indexes use `gin_trgm_ops` for fast fuzzy text search on name fields.

## Key Technical Decisions

### Tailwind CSS v4
Uses the new `@theme` directive for custom colors instead of `tailwind.config.js`:
```css
@import "tailwindcss";
@theme {
  --color-texas-blue: #002868;
  --color-texas-red: #BF0D3E;
  ...
}
```

### Static Site Generation
Astro builds static HTML. All data fetching happens client-side via React components with `client:load` directive. No dynamic server routes.

### Candidate Pages
Uses query params (`/candidate?id=XXX`) instead of dynamic routes (`/candidate/[id]`) because static output mode requires `getStaticPaths()`.

### No Foreign Keys
FK constraints were dropped because TEC data has contributions referencing filers that don't exist in the subset we imported.

## Data Import

The TEC CSV data is at `/Users/josh/Downloads/TEC_CF_CSV (1)/`. Python import scripts filter to 2020+ records only:

```bash
cd scripts
python3 -m venv venv
source venv/bin/activate
pip install supabase python-dotenv

python3 import_filers.py      # ~2,800 records
python3 import_contributions.py  # ~8-10M records (takes hours)
python3 import_expenditures.py   # ~1.5M records
python3 import_reports.py        # ~95K records
```

## Common Tasks

### Adding a New Search Filter
1. Add field to interface in `src/lib/search.ts`
2. Update the search function to apply the filter
3. Add UI control in the relevant search component

### Adding a New Page
1. Create `.astro` file in `src/pages/`
2. Import `BaseLayout` for consistent header/footer
3. Use `client:load` for interactive React components

### Modifying Database Schema
1. Create migration: `bunx supabase migration new description`
2. Edit the SQL file in `supabase/migrations/`
3. Push: `bunx supabase db push`

## Query Builder Features

The QueryBuilder component (`/query-builder`) supports:
- Boolean AND/OR condition groups (nestable)
- 4 data sources: contributions, expenditures, filers, reports
- 12+ operators: equals, contains, starts_with, between, regex, in_list, etc.
- Aggregations: GROUP BY with SUM, COUNT, AVG, MIN, MAX
- CSV export of results
