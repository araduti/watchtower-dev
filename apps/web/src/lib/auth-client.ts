/**
 * @module lib/auth-client
 *
 * Better Auth client-side SDK for Watchtower.
 *
 * Provides hooks and functions for authentication operations:
 * - `authClient.signIn.email()` — email/password sign-in
 * - `authClient.signUp.email()` — email/password sign-up
 * - `authClient.signOut()` — sign out and clear session
 * - `authClient.useSession()` — React hook for current session
 * - `authClient.organization.setActive()` — set active workspace
 * - `authClient.organization.listOrganizations()` — list user's workspaces
 *
 * The client communicates with the Better Auth server via the
 * `/api/auth/*` catch-all route handler.
 */

import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [organizationClient()],
});
