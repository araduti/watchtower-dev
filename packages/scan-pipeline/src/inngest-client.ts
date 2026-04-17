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
 */
export const inngest = new Inngest({
  id: "watchtower",
});
