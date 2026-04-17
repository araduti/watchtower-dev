/**
 * Inngest serve route handler.
 *
 * Registers all scan pipeline functions with Inngest via the Next.js
 * App Router. This endpoint is used by the Inngest dev server (and
 * production Inngest) to discover available functions and receive
 * event-driven invocations.
 *
 * Endpoint: POST/GET /api/inngest
 *
 * `serveOrigin` tells the SDK where the app is reachable *from the
 * Inngest server's perspective*. In dev, the app runs on the host and
 * the Inngest dev server runs inside Docker, so the origin must be
 * `http://host.docker.internal:3000` — not `http://localhost:3000`
 * (which would resolve to the container itself). Without this, the
 * SDK auto-detects the origin from the incoming request's `Host`
 * header, but Next.js may normalise `host.docker.internal` to
 * `localhost`, causing the dev server to call back to itself instead
 * of the host machine.
 *
 * @see https://www.inngest.com/docs/reference/serve
 * @see packages/scan-pipeline/src/index.ts
 */

import { serve } from "inngest/next";
import { inngest, scanFunctions } from "@watchtower/scan-pipeline";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...scanFunctions],
  serveOrigin: process.env.INNGEST_SERVE_ORIGIN,
});
