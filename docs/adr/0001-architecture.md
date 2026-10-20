# 1. One repository, organized as ports and adapters

- **Date:** 2026-10-18
- **Status:** Accepted

## Context

This project answers questions over SEC 10-K filings using several external services: SEC EDGAR for the documents, Azure Document Intelligence for parsing, Azure AI Search for retrieval, and Microsoft Foundry for embeddings and chat models. More are planned: a second chat model (Claude) in weekend 4 and a Next.js interface in weekend 5.

Two questions need an answer before the code grows:

1. **Repository shape.** One repository or several, and if one, whether to split it into separate packages (npm workspaces, Turborepo, Nx) now.
2. **Code organization.** How to keep the question-answering logic independent of the services it uses, so that models and services can be swapped and compared, and the logic can be tested without Azure.

Constraints: one developer, one language (TypeScript), and today one runnable thing (command-line scripts). The evaluation harness must be able to run the same logic against different models and retrieval settings.

## Decision

**We will keep everything in one repository, as a single package, until a second deployable exists.** Code, infrastructure, evaluation data and documentation live together. When the Next.js app arrives in weekend 5, we will split into npm workspaces (`packages/core`, `apps/cli`, `apps/web`). We will not adopt Turborepo or Nx at this size.

**We will organize the code as ports and adapters (hexagonal architecture):**

```
src/
  core/          the logic: domain types, ports (interfaces), use cases, pure functions
  adapters/      one folder per technology, each implementing a port from core
  config.ts      reads and validates environment settings
  composition.ts the only place that wires adapters into the core
scripts/         command-line entry points (driving adapters)
```

Rules:

- `src/core` never imports cloud SDKs, the file system or adapters, never calls `fetch`, and never reads `process`. ESLint enforces this (`eslint.config.js`), so CI fails if the boundary is crossed.
- A port exists only at a real boundary (I/O or a vendor), and every port has at least two implementations: the real adapter and an in-memory fake in `src/adapters/memory` for tests. `ChatModel` will also have two real ones (GPT and Claude).
- Ports use the project's own types (`Chunk`, `Citation`, `AccessGroup`). Adapters translate to and from SDK types.
- Security rules belong in the port contract. For example, `SearchIndex.search` takes the caller's `allowedGroups` as a required argument, so no adapter can skip permission filtering.
- No dependency-injection framework. `composition.ts` builds the adapters with plain constructors.
- Ports are added together with the first code that uses them, not ahead of time.

## Consequences

- Adding a model or service means adding an adapter. The core and the evaluation harness stay the same, which keeps comparisons fair.
- Unit tests run against in-memory fakes in milliseconds, with no Azure access. Evaluations run the same core against the real adapters.
- Porting to another cloud means writing new adapters (for example OpenSearch and Bedrock) while the core stays the same.
- The weekend 5 split into workspaces is mechanical: `src/core` and `src/adapters` become `packages/core`, `scripts` becomes `apps/cli`, and the Next.js app becomes another driving adapter in `apps/web`.
- Cost: a little more structure than a flat folder of scripts, and every port has to be kept small and deliberate. A port without a second implementation should be questioned in review.
