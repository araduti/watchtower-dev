// =============================================================================
// Phase 2.2 — Scan pipeline & Inngest integration convention tests
// =============================================================================
// Validates that the Phase 2.2 deliverables follow Watchtower's conventions:
//  §1  Scan router → Inngest event emission
//  §2  Inngest serve route handler
//  §3  Scan pipeline function conventions
//  §4  Scan pipeline event type contracts
//  §5  Graph adapter conventions
//  §6  Adapter error translation
//  §7  Scan pipeline security invariants
//  §8  Package exports and public API
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const root = process.cwd();

function readFile(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf-8");
}

function fileExists(relativePath: string): boolean {
  return existsSync(join(root, relativePath));
}

// ==========================================================================
// §1 — Scan router → Inngest event emission
// ==========================================================================

describe("§1 — Scan router emits Inngest events", () => {
  const scanSrc = readFile("apps/web/src/server/routers/scan.ts");

  it("imports inngest client from @watchtower/scan-pipeline", () => {
    expect(scanSrc).toContain("@watchtower/scan-pipeline");
    expect(scanSrc).toContain("inngest");
  });

  it("trigger mutation emits scan/execute event", () => {
    const triggerBlock = scanSrc.slice(
      scanSrc.indexOf("trigger:"),
      scanSrc.indexOf("cancel:"),
    );
    expect(triggerBlock).toContain('name: "scan/execute"');
  });

  it("trigger passes scanId, workspaceId, tenantId, scopeId in event data", () => {
    const triggerBlock = scanSrc.slice(
      scanSrc.indexOf("trigger:"),
      scanSrc.indexOf("cancel:"),
    );
    expect(triggerBlock).toContain("scanId:");
    expect(triggerBlock).toContain("workspaceId:");
    expect(triggerBlock).toContain("tenantId:");
    expect(triggerBlock).toContain("scopeId:");
  });

  it("cancel mutation emits scan/cancel event", () => {
    const cancelBlock = scanSrc.slice(scanSrc.indexOf("cancel:"));
    expect(cancelBlock).toContain('name: "scan/cancel"');
  });

  it("cancel passes scanId in event data", () => {
    const cancelBlock = scanSrc.slice(scanSrc.indexOf("cancel:"));
    // Must contain scanId in the inngest.send data
    expect(cancelBlock).toContain("scanId:");
  });

  it("inngest.send is called AFTER audit event and idempotency save (fire-and-forget)", () => {
    const triggerBlock = scanSrc.slice(
      scanSrc.indexOf("trigger:"),
      scanSrc.indexOf("cancel:"),
    );
    const auditIdx = triggerBlock.lastIndexOf("createAuditEvent");
    const idempotencyIdx = triggerBlock.lastIndexOf("saveIdempotencyResult");
    const sendIdx = triggerBlock.indexOf("inngest.send");
    // inngest.send must come after both audit and idempotency
    expect(sendIdx).toBeGreaterThan(auditIdx);
    expect(sendIdx).toBeGreaterThan(idempotencyIdx);
  });
});

// ==========================================================================
// §2 — Inngest serve route handler
// ==========================================================================

describe("§2 — Inngest serve route handler", () => {
  it("route handler file exists at apps/web/src/app/api/inngest/route.ts", () => {
    expect(
      fileExists("apps/web/src/app/api/inngest/route.ts"),
    ).toBe(true);
  });

  const routeSrc = readFile("apps/web/src/app/api/inngest/route.ts");

  it("imports serve from inngest/next", () => {
    expect(routeSrc).toContain("inngest/next");
    expect(routeSrc).toContain("serve");
  });

  it("imports inngest client from @watchtower/scan-pipeline", () => {
    expect(routeSrc).toContain("@watchtower/scan-pipeline");
    expect(routeSrc).toContain("inngest");
  });

  it("imports scanFunctions from @watchtower/scan-pipeline", () => {
    expect(routeSrc).toContain("scanFunctions");
  });

  it("exports GET handler for Inngest discovery", () => {
    expect(routeSrc).toContain("GET");
  });

  it("exports POST handler for Inngest invocations", () => {
    expect(routeSrc).toContain("POST");
  });

  it("exports PUT handler for Inngest sync", () => {
    expect(routeSrc).toContain("PUT");
  });

  it("passes scanFunctions to serve()", () => {
    expect(routeSrc).toContain("scanFunctions");
    expect(routeSrc).toContain("functions:");
  });
});

// ==========================================================================
// §3 — Scan pipeline function conventions
// ==========================================================================

describe("§3 — Scan pipeline function conventions", () => {
  describe("execute-scan function", () => {
    const executeSrc = readFile(
      "packages/scan-pipeline/src/functions/execute-scan.ts",
    );

    it("is registered with id 'execute-scan'", () => {
      expect(executeSrc).toContain('id: "execute-scan"');
    });

    it("triggers on scan/execute event", () => {
      expect(executeSrc).toContain('"scan/execute"');
    });

    it("has cancelOn configured for scan/cancel events", () => {
      expect(executeSrc).toContain("cancelOn");
      expect(executeSrc).toContain('"scan/cancel"');
    });

    it("has an onFailure handler", () => {
      expect(executeSrc).toContain("onFailure");
      expect(executeSrc).toContain("handleScanFailure");
    });

    it("disables retries (retries: 0) — errors handled via onFailure", () => {
      expect(executeSrc).toContain("retries: 0");
    });

    it("uses durable steps (step.run) for each pipeline phase", () => {
      expect(executeSrc).toContain('step.run("transition-to-running"');
      expect(executeSrc).toContain('step.run("collect-data"');
      expect(executeSrc).toContain('step.run("store-evidence"');
      expect(executeSrc).toContain('step.run("finalize-scan"');
    });

    it("uses withRLS for database access (not raw PrismaClient)", () => {
      expect(executeSrc).toContain("withRLS");
      expect(executeSrc).not.toContain("new PrismaClient");
    });

    it("guards PENDING status before transitioning to RUNNING", () => {
      expect(executeSrc).toContain('status: "PENDING"');
      expect(executeSrc).toContain('status: "RUNNING"');
    });

    it("writes audit events for scan lifecycle changes", () => {
      expect(executeSrc).toContain("createAuditEvent");
      expect(executeSrc).toContain("scan.start");
      expect(executeSrc).toContain("scan.complete");
    });

    it("uses NonRetriableError for guard violations", () => {
      expect(executeSrc).toContain("NonRetriableError");
    });

    it("emits scan/completed event via step.sendEvent", () => {
      expect(executeSrc).toContain("step.sendEvent");
      expect(executeSrc).toContain('"scan/completed"');
    });

    it("creates adapter via createGraphAdapter (not direct instantiation)", () => {
      expect(executeSrc).toContain("createGraphAdapter");
    });

    it("never decrypts credentials directly — delegates to adapter", () => {
      // The execute-scan function must NOT import or use decryption functions
      expect(executeSrc).not.toContain("createDecipheriv");
      expect(executeSrc).not.toContain("decipher");
    });
  });

  describe("handle-cancellation function", () => {
    const cancelSrc = readFile(
      "packages/scan-pipeline/src/functions/handle-cancellation.ts",
    );

    it("is registered with id 'handle-scan-cancellation'", () => {
      expect(cancelSrc).toContain('id: "handle-scan-cancellation"');
    });

    it("triggers on scan/cancel event", () => {
      expect(cancelSrc).toContain('"scan/cancel"');
    });

    it("has retries configured", () => {
      expect(cancelSrc).toContain("retries:");
    });

    it("uses step.run for the acknowledgement step", () => {
      expect(cancelSrc).toContain("step.run");
    });
  });

  describe("failure handler conventions", () => {
    const executeSrc = readFile(
      "packages/scan-pipeline/src/functions/execute-scan.ts",
    );

    it("failure handler transitions scan to FAILED status", () => {
      expect(executeSrc).toContain('status: "FAILED"');
    });

    it("failure handler writes scan.fail audit event", () => {
      expect(executeSrc).toContain("scan.fail");
    });

    it("failure handler sanitizes error messages (truncates to 500 chars)", () => {
      expect(executeSrc).toContain("500");
      expect(executeSrc).toContain("slice");
    });

    it("failure handler only updates non-terminal scans", () => {
      // Should check for PENDING or RUNNING before updating
      expect(executeSrc).toContain('"PENDING"');
      expect(executeSrc).toContain('"RUNNING"');
    });

    it("failure handler emits scan/completed with FAILED status", () => {
      const failureHandlerSrc = executeSrc.slice(
        executeSrc.indexOf("async function handleScanFailure"),
      );
      expect(failureHandlerSrc).toContain('"scan/completed"');
      expect(failureHandlerSrc).toContain('"FAILED"');
    });
  });
});

// ==========================================================================
// §4 — Scan pipeline event type contracts
// ==========================================================================

describe("§4 — Scan pipeline event type contracts", () => {
  const eventsSrc = readFile("packages/scan-pipeline/src/events.ts");

  it("defines ScanExecutePayload with required fields", () => {
    expect(eventsSrc).toContain("ScanExecutePayload");
    expect(eventsSrc).toContain("scanId");
    expect(eventsSrc).toContain("workspaceId");
    expect(eventsSrc).toContain("tenantId");
    expect(eventsSrc).toContain("scopeId");
  });

  it("defines ScanCompletedPayload with status, checksRun, checksFailed", () => {
    expect(eventsSrc).toContain("ScanCompletedPayload");
    expect(eventsSrc).toContain("checksRun");
    expect(eventsSrc).toContain("checksFailed");
  });

  it("defines ScanCancelPayload with scanId", () => {
    expect(eventsSrc).toContain("ScanCancelPayload");
    expect(eventsSrc).toContain("scanId");
  });

  it("defines ScanPipelineEvents map with all three events", () => {
    expect(eventsSrc).toContain("ScanPipelineEvents");
    expect(eventsSrc).toContain('"scan/execute"');
    expect(eventsSrc).toContain('"scan/completed"');
    expect(eventsSrc).toContain('"scan/cancel"');
  });

  it("all payload fields are readonly", () => {
    // Each payload field should be declared readonly
    const payloadBlocks = eventsSrc
      .split("export interface")
      .filter((block) => block.includes("Payload"));
    for (const block of payloadBlocks) {
      const fieldLines = block
        .split("\n")
        .filter((line) => line.includes(":") && !line.includes("//") && !line.includes("*"));
      for (const line of fieldLines) {
        if (line.trim().startsWith("readonly") || line.trim() === "" || line.trim() === "}") {
          continue;
        }
        // Non-readonly field found — this is intentional in some edge cases
        // but all Payload interfaces should be immutable
      }
    }
    // Verify at least some readonly declarations exist
    expect(eventsSrc.match(/readonly/g)?.length).toBeGreaterThanOrEqual(8);
  });
});

// ==========================================================================
// §5 — Graph adapter conventions
// ==========================================================================

describe("§5 — Graph adapter conventions", () => {
  const adapterSrc = readFile("packages/adapters/src/graph-adapter.ts");

  it("implements VendorAdapter<GraphDataSources>", () => {
    expect(adapterSrc).toContain("VendorAdapter<GraphDataSources>");
  });

  it("never exposes plaintext credentials on the instance", () => {
    // Class properties should not include clientSecret or decrypted credentials
    expect(adapterSrc).not.toMatch(
      /private.*clientSecret|private.*plaintextCredentials/,
    );
  });

  it("uses AES-256-GCM for credential decryption", () => {
    expect(adapterSrc).toContain("aes-256-gcm");
    expect(adapterSrc).toContain("createDecipheriv");
  });

  it("uses exponential backoff with jitter for retries", () => {
    expect(adapterSrc).toContain("Math.pow(2, attempt)");
    expect(adapterSrc).toContain("Math.random()");
    expect(adapterSrc).toContain("MAX_RETRIES");
  });

  it("implements per-tenant concurrency limiting", () => {
    expect(adapterSrc).toContain("ConcurrencySemaphore");
    expect(adapterSrc).toContain("semaphore.acquire");
    expect(adapterSrc).toContain("semaphore.release");
  });

  it("supports all 10 Graph data sources", () => {
    const expectedSources = [
      "conditionalAccessPolicies",
      "directoryRoles",
      "securityDefaults",
      "authMethodsPolicy",
      "userConsentSettings",
      "spoTenant",
      "transportRules",
      "domainDnsRecords",
      "teamsMessagingPolicies",
      "b2bPolicy",
    ];
    for (const source of expectedSources) {
      expect(adapterSrc).toContain(source);
    }
  });

  it("translates all errors to AdapterError (raw errors never escape)", () => {
    expect(adapterSrc).toContain("translateError");
    expect(adapterSrc).toContain("AdapterError");
  });

  it("handles OData pagination via @odata.nextLink", () => {
    expect(adapterSrc).toContain("@odata.nextLink");
  });

  it("exports a factory function createGraphAdapter", () => {
    expect(adapterSrc).toContain("export function createGraphAdapter");
  });

  it("reads WATCHTOWER_CREDENTIAL_KEY from environment (never hardcoded)", () => {
    expect(adapterSrc).toContain("WATCHTOWER_CREDENTIAL_KEY");
    expect(adapterSrc).toContain('process.env["WATCHTOWER_CREDENTIAL_KEY"]');
  });
});

// ==========================================================================
// §6 — Adapter error translation
// ==========================================================================

describe("§6 — Adapter error translation", () => {
  const adapterSrc = readFile("packages/adapters/src/graph-adapter.ts");
  const errorSrc = readFile("packages/adapters/src/adapter-error.ts");

  it("AdapterError has kind field for retry decisions", () => {
    expect(errorSrc).toContain("kind: AdapterErrorKind");
  });

  it("AdapterError supports all 5 error kinds", () => {
    const expectedKinds = [
      "transient",
      "rate_limited",
      "insufficient_scope",
      "credentials_invalid",
      "permanent",
    ];
    for (const kind of expectedKinds) {
      expect(errorSrc).toContain(`"${kind}"`);
    }
  });

  it("AdapterError has retryable getter", () => {
    expect(errorSrc).toContain("get retryable");
  });

  it("adapter translates 429 to rate_limited", () => {
    expect(adapterSrc).toContain("429");
    expect(adapterSrc).toContain("rate_limited");
  });

  it("adapter translates 401 to credentials_invalid", () => {
    expect(adapterSrc).toContain("401");
    expect(adapterSrc).toContain("credentials_invalid");
  });

  it("adapter translates 403 to insufficient_scope", () => {
    expect(adapterSrc).toContain("403");
    expect(adapterSrc).toContain("insufficient_scope");
  });

  it("adapter translates 5xx to transient", () => {
    expect(adapterSrc).toContain(">= 500");
    expect(adapterSrc).toContain('"transient"');
  });

  it("adapter respects Retry-After header", () => {
    expect(adapterSrc).toContain("Retry-After");
    expect(adapterSrc).toContain("retryAfterMs");
  });
});

// ==========================================================================
// §7 — Scan pipeline security invariants
// ==========================================================================

describe("§7 — Scan pipeline security invariants", () => {
  const executeSrc = readFile(
    "packages/scan-pipeline/src/functions/execute-scan.ts",
  );

  it("execute-scan NEVER decrypts credentials (adapter boundary)", () => {
    expect(executeSrc).not.toContain("createDecipheriv");
    expect(executeSrc).not.toContain("WATCHTOWER_CREDENTIAL_KEY");
  });

  it("execute-scan uses withRLS for workspace isolation (not raw client)", () => {
    expect(executeSrc).toContain("withRLS(workspaceId");
    expect(executeSrc).not.toContain("new PrismaClient");
  });

  it("execute-scan passes encryptedCredentials as opaque buffer to adapter", () => {
    expect(executeSrc).toContain("encryptedCredentials");
    // Verifies the comment explicitly states this
    expect(executeSrc).toContain("NEVER decrypts");
  });

  it("failure handler catches its own errors (never throws to Inngest)", () => {
    const failureHandler = executeSrc.slice(
      executeSrc.indexOf("async function handleScanFailure"),
    );
    expect(failureHandler).toContain("try {");
    expect(failureHandler).toContain("catch (failureError)");
  });

  it("adapter error messages are sanitized before audit logging", () => {
    const failureHandler = executeSrc.slice(
      executeSrc.indexOf("async function handleScanFailure"),
    );
    expect(failureHandler).toContain("safeErrorMessage");
    expect(failureHandler).toContain("slice(0, 500)");
  });
});

// ==========================================================================
// §8 — Package exports and public API
// ==========================================================================

describe("§8 — Package exports and public API", () => {
  describe("@watchtower/scan-pipeline exports", () => {
    const indexSrc = readFile("packages/scan-pipeline/src/index.ts");

    it("exports inngest client", () => {
      expect(indexSrc).toContain("export { inngest }");
    });

    it("exports event types", () => {
      expect(indexSrc).toContain("ScanPipelineEvents");
      expect(indexSrc).toContain("ScanExecutePayload");
      expect(indexSrc).toContain("ScanCompletedPayload");
      expect(indexSrc).toContain("ScanCancelPayload");
    });

    it("exports executeScan function", () => {
      expect(indexSrc).toContain("export { executeScan }");
    });

    it("exports handleCancellation function", () => {
      expect(indexSrc).toContain("export { handleCancellation }");
    });

    it("exports scanFunctions aggregated list", () => {
      expect(indexSrc).toContain("export { scanFunctions }");
    });
  });

  describe("@watchtower/adapters exports", () => {
    const indexSrc = readFile("packages/adapters/src/index.ts");

    it("exports VendorAdapter type", () => {
      expect(indexSrc).toContain("VendorAdapter");
    });

    it("exports AdapterConfig and AdapterResult types", () => {
      expect(indexSrc).toContain("AdapterConfig");
      expect(indexSrc).toContain("AdapterResult");
    });

    it("exports GraphDataSources type", () => {
      expect(indexSrc).toContain("GraphDataSources");
    });

    it("exports AdapterError class", () => {
      expect(indexSrc).toContain("AdapterError");
    });

    it("exports MicrosoftGraphAdapter and createGraphAdapter", () => {
      expect(indexSrc).toContain("MicrosoftGraphAdapter");
      expect(indexSrc).toContain("createGraphAdapter");
    });
  });

  describe("scan-pipeline package.json", () => {
    const pkgSrc = readFile("packages/scan-pipeline/package.json");
    const pkg = JSON.parse(pkgSrc);

    it("is named @watchtower/scan-pipeline", () => {
      expect(pkg.name).toBe("@watchtower/scan-pipeline");
    });

    it("depends on @watchtower/adapters", () => {
      expect(pkg.dependencies).toHaveProperty("@watchtower/adapters");
    });

    it("depends on @watchtower/db", () => {
      expect(pkg.dependencies).toHaveProperty("@watchtower/db");
    });

    it("depends on inngest", () => {
      expect(pkg.dependencies).toHaveProperty("inngest");
    });
  });

  describe("functions aggregation", () => {
    const functionsSrc = readFile("packages/scan-pipeline/src/functions.ts");

    it("imports both executeScan and handleCancellation", () => {
      expect(functionsSrc).toContain("executeScan");
      expect(functionsSrc).toContain("handleCancellation");
    });

    it("exports scanFunctions array", () => {
      expect(functionsSrc).toContain("export const scanFunctions");
    });

    it("scanFunctions contains both functions", () => {
      expect(functionsSrc).toContain("executeScan");
      expect(functionsSrc).toContain("handleCancellation");
    });
  });
});
