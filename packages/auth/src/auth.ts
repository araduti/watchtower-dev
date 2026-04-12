/**
 * @module @watchtower/auth
 *
 * Better Auth server configuration for Watchtower.
 *
 * Uses the Organization plugin to map Better Auth Organizations 1:1
 * to Watchtower Workspaces. The `activeOrganizationId` from the
 * session is used to resolve the Workspace in tRPC context.
 *
 * Session storage uses the same Postgres database as the application
 * (DATABASE_URL). Better Auth manages its own tables (user, session,
 * account, organization, member, invitation).
 */

import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error(
    "[watchtower/auth] DATABASE_URL is not set. " +
      "Better Auth requires a database connection for session storage.",
  );
}

const secret = process.env["BETTER_AUTH_SECRET"];
if (!secret) {
  throw new Error(
    "[watchtower/auth] BETTER_AUTH_SECRET is not set. " +
      "This secret is used for session signing and must be a strong random value.",
  );
}

const baseURL = process.env["BETTER_AUTH_URL"];

export const auth = betterAuth({
  database: {
    type: "postgres",
    url: databaseUrl,
  },
  secret,
  baseURL,
  plugins: [
    organization({
      // Watchtower manages its own RBAC. We disable organization deletion
      // through Better Auth — workspaces soft-delete via our own logic.
      disableOrganizationDeletion: true,
    }),
  ],
});

export type Auth = typeof auth;
