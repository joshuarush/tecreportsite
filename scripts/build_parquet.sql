-- Build parquet files from TEC CSV dump
-- Usage: duckdb < scripts/build_parquet.sql

-- === FILERS ===
COPY (
  SELECT
    filerIdent AS id,
    filerName AS name,
    filerTypeCd AS type,
    NULL::VARCHAR AS party,
    ctaSeekOfficeCd AS office_sought,
    ctaSeekOfficeDistrict AS district_sought,
    filerHoldOfficeCd AS office_held,
    filerHoldOfficeDistrict AS district_held,
    filerStreetCity AS city,
    filerStreetStateCd AS state,
    filerFilerpersStatusCd AS status,
    filerEffStartDt AS effective_start,
    filerEffStopDt AS effective_stop
  FROM read_csv_auto('csv_source/filers.csv', header=true, all_varchar=true)
) TO 'data/filers.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);

-- === CONTRIBUTIONS (2020+) ===
COPY (
  SELECT
    filerIdent AS filer_id,
    filerName AS filer_name,
    TRY_CAST(NULLIF(contributionInfoId, '') AS BIGINT) AS contribution_id,
    TRY_CAST(NULLIF(contributionDt, '') AS INTEGER) AS date,
    TRY_CAST(NULLIF(receivedDt, '') AS INTEGER) AS received_date,
    TRY_CAST(NULLIF(contributionAmount, '') AS DOUBLE) AS amount,
    contributionDescr AS description,
    CASE
      WHEN contributorPersentTypeCd = 'ENTITY' THEN NULLIF(contributorNameOrganization, '')
      ELSE NULLIF(TRIM(
        COALESCE(contributorNameFirst, '') || ' ' || COALESCE(contributorNameLast, '')
      ), '')
    END AS contributor_name,
    contributorPersentTypeCd AS contributor_type,
    contributorStreetCity AS contributor_city,
    contributorStreetStateCd AS contributor_state,
    contributorEmployer AS contributor_employer,
    contributorOccupation AS contributor_occupation
  FROM read_csv_auto('csv_source/contribs_*.csv', header=true, all_varchar=true, union_by_name=true)
  WHERE COALESCE(infoOnlyFlag, 'N') != 'Y'
    AND TRY_CAST(NULLIF(contributionAmount, '') AS DOUBLE) != 0
    AND TRY_CAST(NULLIF(contributionDt, '') AS INTEGER) >= 20200101
) TO 'data/contributions_2020.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);

-- === EXPENDITURES ===
COPY (
  SELECT
    filerIdent AS filer_id,
    filerName AS filer_name,
    TRY_CAST(NULLIF(expendInfoId, '') AS BIGINT) AS expenditure_id,
    TRY_CAST(NULLIF(expendDt, '') AS INTEGER) AS date,
    TRY_CAST(NULLIF(receivedDt, '') AS INTEGER) AS received_date,
    TRY_CAST(NULLIF(expendAmount, '') AS DOUBLE) AS amount,
    expendDescr AS description,
    expendCatCd AS category_code,
    expendCatDescr AS category,
    CASE
      WHEN payeePersentTypeCd = 'ENTITY' THEN NULLIF(payeeNameOrganization, '')
      ELSE NULLIF(TRIM(
        COALESCE(payeeNameFirst, '') || ' ' || COALESCE(payeeNameLast, '')
      ), '')
    END AS payee_name,
    payeeStreetCity AS payee_city,
    payeeStreetStateCd AS payee_state
  FROM read_csv_auto('csv_source/expend_*.csv', header=true, all_varchar=true, union_by_name=true)
  WHERE COALESCE(infoOnlyFlag, 'N') != 'Y'
    AND TRY_CAST(NULLIF(expendAmount, '') AS DOUBLE) != 0
) TO 'data/expenditures.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);

-- === REPORTS ===
COPY (
  SELECT
    filerIdent AS filer_id,
    filerName AS filer_name,
    TRY_CAST(NULLIF(reportInfoIdent, '') AS BIGINT) AS report_id,
    formTypeCd AS form_type,
    reportTypeCd1 AS report_type,
    TRY_CAST(NULLIF(receivedDt, '') AS INTEGER) AS received_date,
    TRY_CAST(NULLIF(filedDt, '') AS INTEGER) AS filed_date,
    periodStartDt AS period_start,
    periodEndDt AS period_end,
    TRY_CAST(NULLIF(totalContribAmount, '') AS DOUBLE) AS total_contributions,
    TRY_CAST(NULLIF(totalExpendAmount, '') AS DOUBLE) AS total_expenditures,
    TRY_CAST(NULLIF(loanBalanceAmount, '') AS DOUBLE) AS loan_balance,
    TRY_CAST(NULLIF(contribsMaintainedAmount, '') AS DOUBLE) AS cash_on_hand
  FROM read_csv_auto('csv_source/cover.csv', header=true, all_varchar=true)
  WHERE COALESCE(infoOnlyFlag, 'N') != 'Y'
) TO 'data/reports.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
