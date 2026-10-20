import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  documentUrl,
  findCompany,
  fiscalYear,
  latestAnnualReports,
  padCik,
  rawFileName,
  submissionsUrl,
  type CompanyTicker,
  type RecentFilings,
} from "./filings";

// Shaped like EDGAR's filings.recent: parallel arrays, newest first.
const recent: RecentFilings = {
  form: ["10-Q", "10-K/A", "10-K", "8-K", "10-K", "10-K"],
  accessionNumber: [
    "0000093410-26-000040",
    "0000093410-26-000031",
    "0000093410-26-000012",
    "0000093410-25-000090",
    "0000093410-25-000009",
    "0000093410-24-000014",
  ],
  filingDate: [
    "2026-08-04",
    "2026-04-10",
    "2026-02-20",
    "2025-10-31",
    "2025-02-21",
    "2024-02-26",
  ],
  reportDate: [
    "2026-06-30",
    "2025-12-31",
    "2025-12-31",
    "",
    "2024-12-31",
    "2023-12-31",
  ],
  primaryDocument: [
    "cvx-20260630.htm",
    "cvx-20251231a.htm",
    "cvx-20251231.htm",
    "cvx-8k.htm",
    "cvx-20241231.htm",
    "cvx-20231231.htm",
  ],
};

describe("padCik", () => {
  it("pads the company ID to 10 digits", () => {
    assert.equal(padCik(93410), "0000093410");
    assert.equal(padCik(1506307), "0001506307");
  });
});

describe("submissionsUrl", () => {
  it("uses the padded company ID", () => {
    assert.equal(
      submissionsUrl(93410),
      "https://data.sec.gov/submissions/CIK0000093410.json",
    );
  });
});

describe("documentUrl", () => {
  it("strips dashes from the accession number and leaves the company ID unpadded", () => {
    assert.equal(
      documentUrl(93410, "0000093410-25-000009", "cvx-20241231.htm"),
      "https://www.sec.gov/Archives/edgar/data/93410/000009341025000009/cvx-20241231.htm",
    );
  });
});

describe("latestAnnualReports", () => {
  it("returns only 10-Ks, newest first, skipping amendments and other forms", () => {
    const reports = latestAnnualReports(recent, 2);
    assert.deepEqual(
      reports.map((r) => r.primaryDocument),
      ["cvx-20251231.htm", "cvx-20241231.htm"],
    );
    assert.equal(reports[0]?.reportDate, "2025-12-31");
  });

  it("returns fewer than requested when fewer exist", () => {
    assert.equal(latestAnnualReports(recent, 10).length, 3);
  });

  it("fails loudly when the parallel arrays don't line up", () => {
    const broken: RecentFilings = {
      ...recent,
      primaryDocument: recent.primaryDocument.slice(0, 2),
    };
    assert.throws(() => latestAnnualReports(broken, 1), /no primaryDocument/);
  });
});

describe("fiscalYear", () => {
  it("reads the year from reportDate", () => {
    assert.equal(fiscalYear("2025-12-31"), 2025);
  });

  it("rejects an empty or malformed date", () => {
    assert.throws(() => fiscalYear(""), /Unexpected reportDate/);
    assert.throws(() => fiscalYear("12/31/2025"), /Unexpected reportDate/);
  });
});

describe("rawFileName", () => {
  it("builds TICKER-YEAR-10k.htm", () => {
    assert.equal(rawFileName("cvx", "2025-12-31"), "CVX-2025-10k.htm");
  });
});

describe("findCompany", () => {
  const tickers: Record<string, CompanyTicker> = {
    "0": { cik_str: 93410, ticker: "CVX", title: "CHEVRON CORP" },
    "1": { cik_str: 1506307, ticker: "KMI", title: "KINDER MORGAN, INC." },
  };

  it("finds a company by ticker, ignoring case", () => {
    assert.equal(findCompany(tickers, "kmi").cik_str, 1506307);
  });

  it("throws for an unknown ticker", () => {
    assert.throws(() => findCompany(tickers, "XYZ"), /XYZ not found/);
  });
});
