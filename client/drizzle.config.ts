import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/postgres/schema.ts",
  out: "./db/postgres/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
