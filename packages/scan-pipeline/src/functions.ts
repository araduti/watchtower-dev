/**
 * Aggregated function list for Inngest serve() registration.
 *
 * Import this array and spread it into the `functions` option of
 * `serve()` to register all scan pipeline functions at once.
 */

import { executeScan } from "./functions/execute-scan.ts";
import { handleCancellation } from "./functions/handle-cancellation.ts";
import { sweepIdempotencyKeys } from "./functions/sweep-idempotency-keys.ts";

/**
 * All scan pipeline Inngest functions.
 *
 * Usage:
 * ```typescript
 * import { inngest, scanFunctions } from "@watchtower/scan-pipeline";
 * serve({ client: inngest, functions: scanFunctions });
 * ```
 */
export const scanFunctions = [executeScan, handleCancellation, sweepIdempotencyKeys] as const;
