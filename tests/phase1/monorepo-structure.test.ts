// =============================================================================
// Phase 1 — Monorepo structure validation tests
// =============================================================================
// Validates workspace config and package definitions. No database required.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const root = process.cwd();

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, relativePath), "utf-8")) as Record<string, unknown>;
}

describe("Monorepo structure", () => {
  it("root package.json has workspaces configured", () => {
    const pkg = readJson("package.json");
    const workspaces = pkg["workspaces"] as string[];
    expect(workspaces).toBeDefined();
    expect(workspaces).toContain("packages/*");
    expect(workspaces).toContain("apps/*");
  });

  it("root package.json is private", () => {
    const pkg = readJson("package.json");
    expect(pkg["private"]).toBe(true);
  });

  it("@watchtower/db package.json is valid", () => {
    const pkg = readJson("packages/db/package.json");
    expect(pkg["name"]).toBe("@watchtower/db");
    expect(pkg["private"]).toBe(true);
  });

  it("@watchtower/errors package.json is valid", () => {
    const pkg = readJson("packages/errors/package.json");
    expect(pkg["name"]).toBe("@watchtower/errors");
    expect(pkg["private"]).toBe(true);
  });

  it("@watchtower/errors has no runtime dependencies", () => {
    const pkg = readJson("packages/errors/package.json");
    expect(pkg["dependencies"]).toBeUndefined();
  });

  it("ADR-001 exists and is non-empty", () => {
    const adrPath = join(root, "docs", "decisions", "001-monorepo-structure.md");
    expect(existsSync(adrPath), "ADR-001 should exist").toBe(true);
    const content = readFileSync(adrPath, "utf-8");
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain("Accepted");
  });

  it("apps/web package.json exists", () => {
    const pkg = readJson("apps/web/package.json");
    expect(pkg["name"]).toBe("@watchtower/web");
    expect(pkg["private"]).toBe(true);
  });
});
