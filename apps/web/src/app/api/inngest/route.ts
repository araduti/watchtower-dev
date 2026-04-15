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
 * @see https://www.inngest.com/docs/reference/serve
 * @see packages/scan-pipeline/src/index.ts
 */

import { serve } from "inngest/next";
import { inngest, scanFunctions } from "@watchtower/scan-pipeline";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...scanFunctions],
});
