/**
 * @module middleware
 *
 * Next.js middleware for route protection.
 *
 * Redirects unauthenticated users away from /dashboard routes.
 * This is a lightweight cookie-presence check — the authoritative
 * session validation happens in the tRPC `enforceAuth` middleware.
 *
 * Better Auth stores sessions in a `better-auth.session_token` cookie.
 * If the cookie is absent, the user cannot have a valid session, so we
 * redirect early and avoid rendering the dashboard shell with stale UI.
 *
 * Threat model:
 * - No cookie → definitely no session → redirect (this middleware).
 * - Cookie present but invalid/expired → dashboard shell renders, but
 *   every tRPC call returns UNAUTHORIZED via `enforceAuth` middleware,
 *   which validates the session against the database. The UI handles
 *   this by showing re-authentication prompts.
 * - An attacker setting a fake cookie bypasses this middleware but gains
 *   no data access — all data flows through tRPC which requires a valid
 *   database-backed session. The middleware is a UX optimization, not a
 *   security boundary.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "better-auth.session_token";

export function middleware(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE);

  if (!sessionToken?.value) {
    const loginUrl = new URL("/", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
