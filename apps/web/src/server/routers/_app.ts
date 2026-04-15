import { router } from "../trpc.ts";
import { auditRouter } from "./audit.ts";
import { checkRouter } from "./check.ts";
import { evidenceRouter } from "./evidence.ts";
import { findingRouter } from "./finding.ts";
import { frameworkRouter } from "./framework.ts";
import { memberRouter } from "./member.ts";
import { permissionRouter } from "./permission.ts";
import { roleRouter } from "./role.ts";
import { scopeRouter } from "./scope.ts";
import { tenantRouter } from "./tenant.ts";
import { workspaceRouter } from "./workspace.ts";

export const appRouter = router({
  audit: auditRouter,
  check: checkRouter,
  evidence: evidenceRouter,
  finding: findingRouter,
  framework: frameworkRouter,
  member: memberRouter,
  permission: permissionRouter,
  role: roleRouter,
  scope: scopeRouter,
  tenant: tenantRouter,
  workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
