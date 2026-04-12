# ADR-002: Better Auth with Organization plugin

**Status:** Accepted  
**Date:** 2026-04-12

## Context

Phase 1.1 introduces authentication and session management. The application
needs to:

1. Authenticate users and manage sessions
2. Map authenticated sessions to Watchtower Workspaces
3. Support multi-workspace membership (a user can belong to multiple workspaces)
4. Provide a session cookie/token that tRPC middleware can resolve

The tech stack specifies Better Auth with the Organization plugin. This ADR
documents why and how the mapping works.

## Decisions

### 1. Better Auth as the auth provider

Better Auth is a TypeScript-native authentication library that:
- Manages its own database tables (user, session, account) in the same Postgres
  database
- Supports cookie-based sessions out of the box
- Provides a `getSession({ headers })` API that integrates cleanly with
  tRPC's `createTRPCContext`
- Has an Organization plugin that maps 1:1 to Watchtower's Workspace concept

Alternatives considered:
- **NextAuth/Auth.js**: More mature but heavier, and its session model doesn't
  map as cleanly to the Organization → Workspace bridging pattern.
- **Custom JWT**: More control but significant implementation effort for session
  management, refresh tokens, CSRF protection, etc.

### 2. Organization plugin maps to Workspace

Better Auth's Organization is a 1:1 bridge to Watchtower's Workspace:

| Better Auth concept | Watchtower concept | Relationship |
|---|---|---|
| Organization | Workspace | 1:1 via `betterAuthOrgId` |
| Organization Member | Membership | Watchtower manages its own |
| Active Organization | Active Workspace | Via session's `activeOrganizationId` |

The mapping flow:
1. User authenticates → Better Auth creates a session
2. User selects a workspace → calls `setActiveOrganization(orgId)`
3. tRPC context resolver reads `session.activeOrganizationId`
4. Resolver queries `Workspace.findUnique({ where: { betterAuthOrgId } })`
5. Returns `{ userId, workspaceId }` — the core identity for every request

### 3. Organization deletion disabled in Better Auth

Watchtower uses soft-delete for Workspaces (`deletedAt` timestamp). Better Auth's
`deleteOrganization` would hard-delete the org record, breaking the bridge.
Setting `disableOrganizationDeletion: true` ensures workspace lifecycle is
entirely managed by Watchtower's own logic.

### 4. Better Auth RBAC disabled — Watchtower manages its own

Better Auth's Organization plugin has built-in roles (owner, admin, member).
Watchtower has its own permission-first RBAC system with 60 permissions, 4
system roles, and custom roles per workspace. We do NOT use Better Auth's
role/permission system. Better Auth handles authentication only; Watchtower
handles authorization.

### 5. Session storage in Postgres (not JWT)

Better Auth stores sessions in the database by default. This is correct for
Watchtower because:
- Sessions can be revoked server-side (compliance requirement)
- Session data includes `activeOrganizationId` which changes when users
  switch workspaces
- On-premises deployment means no external session store is needed
- The session table is small and fast with an index on the token

### 6. Session resolution returns null on failure (never throws)

The `resolveSession()` function returns `null` for any authentication failure
(expired cookie, malformed token, no active organization, soft-deleted
workspace). The tRPC `enforceAuth` middleware converts null sessions to
`UNAUTHORIZED` errors with the proper Layer 2 code.

This separation is intentional:
- Session resolution is a data lookup — it should not throw
- Error formatting is tRPC's responsibility — it knows the error shape
- Different callers (API routes, webhooks) may want different error handling

### 7. Audit log placeholder fields in Phase 1.1

The workspace.updateSettings mutation writes an audit log entry but uses
placeholder values for the hash chain fields (prevHash, rowHash, chainSequence,
signature, signingKeyId). The full hash-chain construction requires:
- An AuditSigningKey loaded at startup
- Ed25519 signing infrastructure
- Chain sequence management

These are Phase 1.2 concerns. The placeholder approach:
- Maintains the schema contract (all required fields are present)
- Proves the audit log write path works in the same transaction
- Is clearly marked with comments referencing this ADR

## Consequences

**Easier:** Session management is handled by a well-tested library. The
Organization → Workspace bridge is a simple unique-key lookup. RBAC is
fully under Watchtower's control.

**Harder:** Two sets of tables in the database (Better Auth's + Watchtower's).
The `betterAuthOrgId` bridge column must be kept in sync when organizations
are created. Better Auth table migrations are managed separately from Prisma
migrations.

**Deferred:** Rate limiting on auth endpoints, MFA/2FA, social login providers,
email verification. All are supported by Better Auth but not configured yet.
