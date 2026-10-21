# Energy Document Intelligence

Question answering over the SEC 10-K filings of four energy companies (Chevron, Halliburton, Quanta Services, Kinder Morgan), with citations, refusal when retrieval confidence is low, permission-aware retrieval, and an evaluation harness.

Built in TypeScript on Azure: Document Intelligence for parsing, AI Search for retrieval, and Microsoft Foundry for embeddings and chat. Access is keyless (Microsoft Entra ID); the repository holds no secrets.

## Status

Step 1 of the roadmap, ingestion and a first end-to-end answer, is in progress. Filings can be downloaded and parsed; chunking, indexing and answering come next.

## Getting started

Requirements: Node 24 (see `.nvmrc`), the Azure CLI signed in with `az login`, and access to the project's Azure resources.

```bash
npm install
cp .env.example .env   # then fill in the endpoints and SEC_USER_AGENT
```

| Command                                                    | What it does                                                                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run download`                                         | Fetches the two latest 10-Ks per company from SEC EDGAR into `data/raw/` (free; needs `SEC_USER_AGENT`)              |
| `npm run parse -- --ticker HAL --year 2024`                | Parses filings with Document Intelligence into `data/parsed/`. Billed per page, so uncached filings need `--confirm` |
| `npm run ingest`                                           | Chunks parsed filings, embeds them and uploads them to the AI Search index. Dry run by default; `--confirm` to run   |
| `npm run ask -- "What was Halliburton's revenue in 2024?"` | Answers from the indexed filings with gpt-5-mini, citing the 10-K sections it used                                   |
| `npm run check`                                            | Typecheck, lint, format check and unit tests (what CI runs)                                                          |

## Design

The code follows ports and adapters: the logic in `src/core` talks to Azure and the file system only through interfaces, so it can be tested with in-memory fakes and models can be swapped and compared. See [ADR 0001](docs/adr/0001-architecture.md).
