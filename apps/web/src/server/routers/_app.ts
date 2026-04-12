import { router } from "../trpc.ts";
import { permissionRouter } from "./permission.ts";

export const appRouter = router({
  permission: permissionRouter,
});

export type AppRouter = typeof appRouter;
