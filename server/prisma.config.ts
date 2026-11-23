// Prisma CLI config. Run the CLI through Bun (`bun --bun prisma ...`, see package.json
// scripts) so `.env` is loaded automatically — Prisma 7 no longer reads it itself.
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
