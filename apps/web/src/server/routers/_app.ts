import { router } from "../trpc.ts";
import { permissionRouter } from "./permission.ts";
import { workspaceRouter } from "./workspace.ts";
import { scopeRouter } from "./scope.ts";

export const appRouter = router({
  permission: permissionRouter,
  workspace: workspaceRouter,
  scope: scopeRouter,
});

export type AppRouter = typeof appRouter;
