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
 *
 * The database adapter uses Prisma (via `better-auth/adapters/prisma`)
 * to share the same PrismaClient and pg.Pool as the rest of the
 * application, rather than creating a separate Kysely connection pool.
 */

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { prisma } from "@watchtower/db";

const secret = process.env["BETTER_AUTH_SECRET"];
if (!secret) {
  throw new Error(
    "[watchtower/auth] BETTER_AUTH_SECRET is not set. " +
      "This secret is used for session signing and must be a strong random value.",
  );
}

const baseURL = process.env["BETTER_AUTH_URL"];

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
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
