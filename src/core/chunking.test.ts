import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chunkDocument,
  cleanMarkdown,
  packParagraphs,
  splitSections,
  tableToText,
} from "./chunking";
import type { Filing } from "./types";

// Shaped like Document Intelligence output for a 10-K financial table:
// padding cells, and "$" and "%" in cells of their own.
const revenueTable = `<table>
<tr>
<td></td>
<td></td>
</tr>
<tr>
<td colspan="3">Millions of dollars</td>
<td colspan="3">2024</td>
<td colspan="3">2023</td>
</tr>
<tr>
<td colspan="3">Total revenue</td>
<td>$</td>
<td>22,944</td>
<td></td>
<td>$</td>
<td>23,018</td>
<td></td>
<td colspan="2">(3)</td>
<td>%</td>
</tr>
</table>`;

describe("tableToText", () => {
  it("writes one line per row, dropping empty cells and joining $ and %", () => {
    assert.equal(
      tableToText(revenueTable),
      "Millions of dollars | 2024 | 2023\nTotal revenue | $22,944 | $23,018 | (3)%",
    );
  });

  it("decodes entities and strips tags inside cells", () => {
    assert.equal(
      tableToText("<table><tr><td><b>AT&amp;T</b></td></tr></table>"),
      "AT&T",
    );
  });
});

describe("cleanMarkdown", () => {
  it("replaces tables with text, removes escapes and collapses blank lines", () => {
    const markdown = `For the transition period from \\_\\_to\\_\\_


${revenueTable}

\\- Artificial Lift: provides services`;
    assert.equal(
      cleanMarkdown(markdown),
      "For the transition period from __to__\n\nMillions of dollars | 2024 | 2023\nTotal revenue | $22,944 | $23,018 | (3)%\n\n- Artificial Lift: provides services",
    );
  });
});

describe("splitSections", () => {
  const text = [
    "FORM 10-K",
    "Item 1. | Business | 1",
    "PART I",
    "Item 1. Business.",
    "We provide services.",
    "Item 1(a). Risk Factors.",
    "Prices may fall.",
    "Item 1A. Another way to write it.",
    "Text.",
    `Item 7. ${"is mentioned at the start of a long sentence ".repeat(5)}`,
    "PART II",
    "Item 6. (Reserved)",
  ].join("\n");

  it("recognizes the heading styles used by different companies", () => {
    const headings = [
      "ITEM 1.Business",
      "Items 1 and 2. Business and Properties.",
      "Item 6. [Reserved]",
      "Item 7A. Quantitative and Qualitative Disclosures About Market Risk",
    ];
    const sections = splitSections(
      headings.map((h) => `${h}\nSome text.`).join("\n"),
    );
    assert.deepEqual(
      sections.map((s) => s.heading),
      headings,
    );
  });

  it("labels a financial section printed after Part III with Items 7 and 8", () => {
    const sections = splitSections(
      [
        "Item 7. Management’s Discussion and Analysis.",
        "See the Financial Section.",
        "Item 14. Principal Accountant Fees and Services",
        "Incorporated by reference.",
        "Management’s Discussion and Analysis of Financial Condition and Results of Operations",
        "Revenue grew.",
        "Management’s Responsibility for Financial Statements",
        "The statements are fair.",
        "Item 15. Exhibits",
        "List.",
      ].join("\n"),
    );
    assert.deepEqual(
      sections.map((s) => [s.heading.slice(0, 7), s.text]),
      [
        ["Item 7.", "See the Financial Section."],
        ["Item 14", "Incorporated by reference."],
        ["Item 7.", "Revenue grew."],
        ["Item 8.", "The statements are fair."],
        ["Item 15", "List."],
      ],
    );
  });

  it("does not treat a quoted cross-reference as a heading", () => {
    const sections = splitSections(
      "Item 7. Management’s Discussion.\nItems 1 and 2. “Business and Properties—Regulation.”\nMore text.",
    );
    assert.deepEqual(
      sections.map((s) => s.heading),
      ["Item 7. Management’s Discussion."],
    );
  });

  it("splits at item headings, not table-of-contents rows, and keeps the cover page as its own section", () => {
    assert.deepEqual(
      splitSections(text).map((s) => s.heading),
      [
        "Cover page and table of contents",
        "Item 1. Business.",
        "Item 1(a). Risk Factors.",
        "Item 1A. Another way to write it.",
      ],
    );
  });

  it("keeps long lines that mention an item as text, and drops PART lines and empty sections", () => {
    const sections = splitSections(text);
    const last = sections.at(-1);
    assert.ok(last?.text.startsWith("Text.\nItem 7. is mentioned"));
    assert.ok(sections.every((s) => !s.text.includes("PART")));
    assert.ok(!sections.some((s) => s.heading === "Item 6. (Reserved)"));
  });
});

describe("packParagraphs", () => {
  it("packs whole paragraphs together up to the limit", () => {
    assert.deepEqual(packParagraphs("aaaa\n\nbbbb\n\ncccc", 10), [
      "aaaa\n\nbbbb",
      "cccc",
    ]);
  });

  it("splits a long paragraph by sentence", () => {
    assert.deepEqual(packParagraphs("One two. Three four. Five six.", 20), [
      "One two. Three four.",
      "Five six.",
    ]);
  });

  it("splits a long table by row", () => {
    assert.deepEqual(packParagraphs("a | 1\nb | 2\nc | 3", 11), [
      "a | 1\nb | 2",
      "c | 3",
    ]);
  });

  it("hard-splits text with no sentence or line breaks", () => {
    assert.deepEqual(packParagraphs("x".repeat(25), 10), [
      "x".repeat(10),
      "x".repeat(10),
      "x".repeat(5),
    ]);
  });
});

describe("chunkDocument", () => {
  const filing: Filing = {
    ticker: "HAL",
    company: "HALLIBURTON CO",
    cik: 45012,
    form: "10-K",
    accessionNumber: "0000045012-25-000010",
    filingDate: "2025-02-12",
    reportDate: "2024-12-31",
    primaryDocument: "hal-20241231.htm",
    fiscalYear: 2024,
    sourceUrl: "https://www.sec.gov/example",
    file: "data/raw/HAL-2024-10k.htm",
  };
  const markdown = [
    "FORM 10-K",
    "",
    "Item 1. Business.",
    "",
    "A".repeat(30),
    "",
    "B".repeat(30),
    "",
    "Item 7. Management’s Discussion and Analysis.",
    "",
    revenueTable,
  ].join("\n");

  it("numbers chunks in reading order and carries citation fields", () => {
    const chunks = chunkDocument({ filing, markdown }, 40);
    assert.deepEqual(
      chunks.map((c) => [c.id, c.section]),
      [
        ["HAL-2024-0000", "Cover page and table of contents"],
        ["HAL-2024-0001", "Item 1. Business."],
        ["HAL-2024-0002", "Item 1. Business."],
        ["HAL-2024-0003", "Item 7. Management’s Discussion and Analysis."],
        ["HAL-2024-0004", "Item 7. Management’s Discussion and Analysis."],
      ],
    );
    assert.ok(chunks.every((c) => c.text.length <= 40));
    assert.ok(chunks.every((c) => c.sourceUrl === filing.sourceUrl));
  });
});
