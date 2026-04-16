/**
 * @module api/auth
 *
 * Better Auth catch-all API route handler.
 *
 * Better Auth exposes endpoints for sign-in, sign-up, sign-out,
 * session management, and organization operations under /api/auth/*.
 * This catch-all route delegates all requests to the Better Auth handler.
 */

import { auth } from "@watchtower/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
