# Energy Document Intelligence

Question answering over energy-company SEC 10-K filings (Chevron, Halliburton, Quanta Services, Kinder Morgan) with citations, refusal when retrieval confidence is low, permission-aware retrieval, and an evaluation harness. TypeScript on Azure: Document Intelligence (parsing), AI Search (retrieval), Microsoft Foundry (embeddings and chat).

This is David Reedy's portfolio project for forward-deployed / senior engineering interviews. David must be able to explain every line, so prefer simple, readable code over clever code, and explain non-obvious choices in comments and PR descriptions.

## Ground rules (never break these)

- Azure: only the personal subscription in `.env` (`AZURE_SUBSCRIPTION_ID`). Never use or select any other subscription.
- No secrets anywhere. Access is keyless (Entra ID via `az login` locally, `DefaultAzureCredential` in code). Never read, print or create API keys (no `az ... keys list`), never commit `.env`, and never paste IDs or tokens into PR text.
- Public data only. Nothing from David's employer (code, prompts, data, configuration) goes into this repo.
- Ask before spending money or changing Azure: creating or deleting resources, raising model capacity, or parsing documents with Document Intelligence (billed per page, about $10 per 1,000 pages).
- `scripts/provision.sh` records how the existing resources were created. Do not rerun it.

## Commands

- `npm run check`: typecheck, lint, format check, unit tests (CI runs this)
- `npm test`: unit tests only (`node:test` via `tsx --test`)
- `npm run format`: fix formatting with Prettier
- `npm run download`: fetch the latest 10-Ks from SEC EDGAR into `data/raw/` (needs `SEC_USER_AGENT` in `.env`)
- `npm run parse -- --ticker HAL --year 2024`: parse filings with Document Intelligence into `data/parsed/`. Cached results are free; uncached filings are billed and need `--confirm` (ask David first)
- `npm run ingest`: dry run of chunking, embedding and indexing (counts, estimated cost and index size). `--confirm` creates the search index if missing, embeds and uploads (changes Azure and spends a little: ask David first)
- `npm run ask -- "question"`: answer from the index with cited sources (one embedding and one gpt-5-mini call per question; ask David before running it)

## Architecture: ports and adapters (see `docs/adr/0001-architecture.md`)

```
src/core/        logic: domain types, ports (interfaces), use cases, pure functions
src/adapters/    one folder per technology, each implementing a port; memory/ holds test fakes
src/config.ts    reads and validates .env
src/composition.ts  the only place that wires adapters into the core
scripts/         thin command-line entry points
```

- `src/core` never imports cloud SDKs, `node:fs` or adapters, and never uses `fetch` or `process`. ESLint enforces this.
- Add a port only at a real boundary (I/O or a vendor), together with its first use. Every port gets a real adapter and an in-memory fake.
- Ports use project types (`Chunk`, `Citation`, `AccessGroup`); adapters translate SDK types.
- Permission filtering is part of the `SearchIndex` contract (`allowedGroups` is required).
- No dependency-injection framework; plain constructors in `src/composition.ts`.

## Code conventions

- TypeScript strict with `noUncheckedIndexedAccess`. Handle `undefined` explicitly; no non-null assertions (`!`).
- Keep pure logic separate from I/O so it can be unit-tested; tests sit next to the code as `*.test.ts`.
- ES modules, Node 24 (`.nvmrc`), no new dependencies without a reason in the PR.
- Fail loudly with clear error messages that include the cause.

## Azure resources (resource group `rg-energydocs-dev`)

- Document Intelligence (S0, East US 2), endpoint in `AZURE_DOCINTEL_ENDPOINT`
- AI Search (Free tier, Central US, 50 MB total), endpoint in `AZURE_SEARCH_ENDPOINT`
- Foundry resource and project (East US 2): `gpt-5-mini` for answers, `text-embedding-3-small` for embeddings at 512 dimensions to fit the Free Search tier. OpenAI-compatible endpoint in `AZURE_OPENAI_ENDPOINT`; token scope `https://ai.azure.com/.default`.

## Workflow

- Short branches, never commit to `main` directly. One pull request per change with a one-paragraph description; squash and merge after CI passes.
- Record significant decisions as ADRs in `docs/adr/` (context, decision as "We will…", consequences).

## Roadmap

1. Ingestion and a naive end-to-end answer (current)
2. Evaluation harness and golden question set, with baseline numbers
3. Layout-aware chunking, hybrid search, semantic ranking (before/after table)
4. Refusal, citations, permission filtering, cost and latency logging, second model (Claude) behind `ChatModel`
5. Next.js UI, split into npm workspaces, Bicep instead of `provision.sh`
