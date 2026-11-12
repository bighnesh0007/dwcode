import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/data/postgres/schema.ts",
  out: "./src/data/postgres/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
