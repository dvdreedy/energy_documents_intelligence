/**
 * Helpers for SEC EDGAR's public JSON APIs.
 * Pure functions only — no network or disk access — so they can be unit-tested.
 */

/** One entry in https://www.sec.gov/files/company_tickers.json */
export interface CompanyTicker {
  cik_str: number;
  ticker: string;
  title: string;
}

/**
 * The `filings.recent` block of https://data.sec.gov/submissions/CIK##########.json.
 * Parallel arrays, newest first: index i across every array is one filing.
 */
export interface RecentFilings {
  form: string[];
  accessionNumber: string[];
  filingDate: string[];
  reportDate: string[];
  primaryDocument: string[];
}

export interface FilingRef {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  primaryDocument: string;
}

/** Annual report form. Amendments ("10-K/A") are excluded on purpose. */
export const ANNUAL_REPORT_FORM = "10-K";

/** EDGAR URLs use the company ID (CIK) padded to 10 digits: 93410 -> "0000093410". */
export function padCik(cik: number): string {
  return String(cik).padStart(10, "0");
}

export function submissionsUrl(cik: number): string {
  return `https://data.sec.gov/submissions/CIK${padCik(cik)}.json`;
}

/** Archive URLs use the unpadded CIK and the accession number without dashes. */
export function documentUrl(
  cik: number,
  accessionNumber: string,
  primaryDocument: string,
): string {
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replaceAll("-", "")}/${primaryDocument}`;
}

export function findCompany(
  tickers: Record<string, CompanyTicker>,
  ticker: string,
): CompanyTicker {
  const wanted = ticker.toUpperCase();
  const company = Object.values(tickers).find((c) => c.ticker === wanted);
  if (!company) {
    throw new Error(`Ticker ${wanted} not found in SEC company list`);
  }
  return company;
}

/** The newest `count` 10-K filings, newest first. */
export function latestAnnualReports(
  recent: RecentFilings,
  count: number,
): FilingRef[] {
  const reports: FilingRef[] = [];
  for (let i = 0; i < recent.form.length && reports.length < count; i++) {
    if (recent.form[i] !== ANNUAL_REPORT_FORM) continue;
    reports.push({
      accessionNumber: field(recent.accessionNumber, i, "accessionNumber"),
      filingDate: field(recent.filingDate, i, "filingDate"),
      reportDate: field(recent.reportDate, i, "reportDate"),
      primaryDocument: field(recent.primaryDocument, i, "primaryDocument"),
    });
  }
  return reports;
}

/**
 * Year of the period the report covers, taken from reportDate ("2025-12-31" -> 2025).
 * All four companies in this project end their fiscal year on December 31.
 */
export function fiscalYear(reportDate: string): number {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(reportDate);
  if (!match?.[1]) {
    throw new Error(`Unexpected reportDate "${reportDate}"`);
  }
  return Number(match[1]);
}

/** Local file name for a raw filing, e.g. "CVX-2025-10k.htm". */
export function rawFileName(ticker: string, reportDate: string): string {
  return `${ticker.toUpperCase()}-${fiscalYear(reportDate)}-10k.htm`;
}

/**
 * Reads one value from a parallel array. Fails loudly instead of letting a
 * missing value (arrays of different lengths, an empty string) slip through.
 */
function field(values: string[], index: number, name: string): string {
  const value = values[index];
  if (!value) {
    throw new Error(`EDGAR filing record ${index} has no ${name}`);
  }
  return value;
}
