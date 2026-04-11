import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migration tooling and the Prisma CLI use the migrate role.
    // The runtime application uses DATABASE_URL via its own PrismaClient
    // construction, NOT via this config file.
    url: process.env.DATABASE_MIGRATE_URL as string,
  },
});