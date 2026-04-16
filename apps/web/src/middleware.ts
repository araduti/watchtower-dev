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
