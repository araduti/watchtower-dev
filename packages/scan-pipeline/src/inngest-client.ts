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

// ---------------------------------------------------------------------------
// Dev-mode fetch wrapper
// ---------------------------------------------------------------------------
//
// The Inngest SDK v4 sends events via POST /e/{key} and expects a JSON
// response of the shape `{ ids: string[], status: 200 }`.  Newer versions
// of the Inngest dev server (inngest/inngest:latest) return an empty body
// (or non-JSON body) with HTTP 200, causing `response.json()` to throw.
// The SDK interprets this as a failure and retries up to 5 times with
// exponential back-off, adding ~2 s of latency and logging spurious errors.
//
// The events *are* delivered — the dev server invokes the registered
// functions successfully — so the only problem is the response parsing.
//
// This wrapper intercepts responses to the event-ingest endpoint and, when
// the body cannot be parsed as JSON or is missing the required `status`
// field, synthesises the response the SDK expects.  The wrapper is a no-op
// in production because the Inngest cloud API already returns the correct
// format.
// ---------------------------------------------------------------------------

/** Return true when `url` targets the Inngest event-ingest endpoint. */
function isEventIngestUrl(url: string): boolean {
  try {
    return new URL(url).pathname.startsWith("/e/");
  } catch {
    return false;
  }
}

/**
 * Wraps `globalThis.fetch` so that event-ingest responses from the
 * Inngest dev server always conform to the SDK's expected schema.
 */
async function devSafeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const method = init?.method ?? "GET";

  let response: Response;
  try {
    response = await globalThis.fetch(input, init);
  } catch (fetchError) {
    console.error(
      `[inngest:devSafeFetch] fetch threw: ${method} ${url}`,
      fetchError,
    );
    throw fetchError;
  }

  console.debug(
    `[inngest:devSafeFetch] intercepted: ${method} ${url} → ${response.status}`,
  );

  // Only patch event-ingest responses that returned 2xx.
  if (!response.ok || !isEventIngestUrl(url)) {
    return response;
  }

  // Try to parse the body; if it already has `status: 200`, return as-is.
  const text = await response.text();
  if (text) {
    try {
      const json = JSON.parse(text);
      if (
        typeof json === "object" &&
        json !== null &&
        json.status === 200
      ) {
        // Already valid — return a fresh Response with the same body so
        // the SDK can call .json() on it.
        console.debug(
          `[inngest:devSafeFetch] body valid, passing through: ${method} ${url}`,
        );
        return new Response(text, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
      // JSON is parseable but missing/wrong `status` — patch it.
      console.warn(
        `[inngest:devSafeFetch] body missing status:200, patching: ${method} ${url}`,
      );
      const patched = { ids: [], ...json, status: 200 };
      return new Response(JSON.stringify(patched), {
        status: response.status,
        statusText: response.statusText,
        headers: { "content-type": "application/json" },
      });
    } catch {
      // Not JSON — fall through to synthesise below.
    }
  }

  // Empty body or unparseable — synthesise a valid response.
  console.warn(
    `[inngest:devSafeFetch] empty/unparseable body, synthesising response: ${method} ${url}`,
  );
  return new Response(JSON.stringify({ ids: [], status: 200 }), {
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
  });
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

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
 *
 * A custom `fetch` wrapper is provided to handle response-format
 * mismatches between the Inngest dev server and SDK v4 — see the
 * block comment above `devSafeFetch` for details.
 */
export const inngest = new Inngest({
  id: "watchtower",
  isDev: process.env.NODE_ENV !== "production",
  fetch: devSafeFetch as typeof fetch,
});
