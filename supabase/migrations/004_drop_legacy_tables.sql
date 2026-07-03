-- Drop legacy tables that were replaced by DuckDB-WASM + Parquet files on R2 CDN.
-- Only party_tags is still actively used by the application.

DROP TABLE IF EXISTS contributions CASCADE;
DROP TABLE IF EXISTS expenditures CASCADE;
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS filers CASCADE;
