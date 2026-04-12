# ADR-001: Monorepo structure

**Status:** Accepted  
**Date:** 2026-04-12

## Context

Phase 1.0 introduces application-layer packages alongside the existing database
foundation. We need a workspace structure that supports multiple packages
(`packages/db`, `packages/errors`) and applications (`apps/web`) while keeping
CI simple and dependency management consistent.

## Decisions

### 1. Bun workspaces (not Turborepo / Nx)

CI and local development both use Bun, matching the project's stated runtime.
The `"workspaces"` field in `package.json` is native to Bun. Adding
Turborepo/Nx would increase CI complexity for marginal benefit at ~3 packages.
Only `bun.lock` is committed; no `package-lock.json`. Revisit at >8 packages
or >60s CI builds.

### 2. `prisma/` stays at root

The schema is a shared contract, not an implementation detail of one package.
`prisma.config.ts` uses `DATABASE_MIGRATE_URL` (the migration role);
`packages/db` is runtime-only and must never reference it. Existing scripts
(`db:migrate`, `db:seed`) work without change.

### 3. `pg` npm package (not Bun's native `Bun.sql`)

`@prisma/adapter-pg` requires `pg.Pool`. `Bun.sql` is experimental, lacks a
Pool abstraction, and is not supported by `@prisma/adapter-pg`. `pg` works
identically under Bun and Node.js. Database access is I/O-bound — no
performance difference.

### 4. Shared dependencies hoisted to root

`@prisma/client`, `@prisma/adapter-pg`, and `pg` are root dependencies.
Workspace packages consume them via hoisting. Prevents version drift.

### 5. `@watchtower/errors` has zero dependencies

Error codes are pure data, usable from tRPC routers, Inngest workers, and
tests. The tRPC-specific factory (`TRPCError` wrapper) lives in
`apps/web/src/server/errors.ts`, not in the shared package.

## Consequences

**Easier:** Onboarding (one `bun install`), CI (single runtime matches dev),
schema governance (single source of truth), cross-package error codes.

**Harder:** Parallel builds (no Turborepo cache), granular dependency trees
(hoisting means all packages share versions). Both acceptable at current scale.
