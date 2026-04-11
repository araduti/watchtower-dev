import "dotenv/config"; // Tvinga in .env
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Använd as string för att göra TS nöjd
    url: process.env.DATABASE_URL as string,
  },
});
