import { router } from "../trpc.ts";
import { permissionRouter } from "./permission.ts";
import { workspaceRouter } from "./workspace.ts";
import { scopeRouter } from "./scope.ts";
import { tenantRouter } from "./tenant.ts";

export const appRouter = router({
  permission: permissionRouter,
  workspace: workspaceRouter,
  scope: scopeRouter,
  tenant: tenantRouter,
});

export type AppRouter = typeof appRouter;
