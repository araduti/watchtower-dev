/**
 * Inngest client instance for the Watchtower scan pipeline.
 *
 * A single Inngest client is shared by all scan pipeline functions.
 * The client is configured with:
 * - App ID `watchtower` for identification in the Inngest dashboard
 *
 * The client is exported so the web app can use it to send events
 * (e.g., from `scan.trigger`) and the worker process can register
 * the functions.
 *
 * @see https://www.inngest.com/docs/reference/client
 */

import { Inngest } from "inngest";

/**
 * Shared Inngest client for all scan pipeline functions.
 *
 * Event payloads are typed at the function/send-site level via
 * the event type definitions in `./events.ts`.
 *
 * `isDev` is derived from NODE_ENV so the SDK automatically sends
 * events to the local dev server (default http://127.0.0.1:8288)
 * in development, without requiring the INNGEST_DEV env var.
 * Uses `!== "production"` (not `=== "development"`) intentionally:
 * this ensures dev mode is active in test, development, and when
 * NODE_ENV is unset — only an explicit "production" activates cloud mode.
 * In production, the SDK uses INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY
 * to authenticate with the Inngest cloud or self-hosted instance.
 */
export const inngest = new Inngest({
  id: "watchtower",
  isDev: process.env.NODE_ENV !== "production",
});
