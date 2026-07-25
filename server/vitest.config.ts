import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    // Integration tests spin up mongodb-memory-server; give them room.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
