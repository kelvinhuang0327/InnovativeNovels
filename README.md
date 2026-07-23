# InnovativeNovels

Wave 0 establishes a Vite + React + TypeScript application shell and
framework-independent domain contracts for catalog identity, reading position,
reading progress, and chapter access.

## Commands

- `npm test -- --run` — run the non-watch Vitest suite.
- `npm run build` — type-check and build the application.
- `npm run lint` — lint TypeScript and React source.
- `npm run typecheck` — run TypeScript project checks.

## Architecture boundaries

Dependency flow is `app → features/application/infrastructure`, then
`features → application/domain/shared`, `application → domain`, and
`infrastructure → application ports/domain contracts`.

The domain layer must never import React, browser APIs, storage, a Service
Worker, or the legacy repository. UI must not reimplement reading-progress or
chapter-access policy.

Wave 0 intentionally contains no Catalog, Book Detail, Reader, routing,
persistence, PWA, API, authentication, payment, wallet, entitlement, native
wrapper, or deployment behavior.
