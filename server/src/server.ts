/**
 * Process entry point. Responsibilities, in order:
 *   1. report configuration (fail fast already happened at config import)
 *   2. build the container and the app
 *   3. listen
 *   4. start the upstream heartbeat
 *   5. shut down gracefully on SIGTERM/SIGINT
 */
import { buildApp } from "./app.ts";
import { buildContainer } from "./container.ts";
import { capabilities, config } from "./config/index.ts";
import { connectDatabase, disconnectDatabase } from "./db/connection.ts";
import { logger } from "./lib/logger.ts";

function reportCapabilities(): void {
  logger.info({ enabled: capabilities.enabled }, "capabilities enabled");
  for (const { capability, vars } of capabilities.missing) {
    logger.warn(
      { capability, missing: vars },
      `capability "${capability}" is disabled: missing env vars`,
    );
  }
}

async function main(): Promise<void> {
  reportCapabilities();

  // Connect before listening so the first request never races the connection.
  // A missing MONGODB_URI logs a warning and leaves DB features disabled.
  await connectDatabase();

  const container = buildContainer();
  const app = buildApp(container);

  const server = app.listen(config.port, () => {
    logger.info(
      {
        // `env` is already on every record via the logger's `base`.
        port: config.port,
        compiler: config.dataweave.compilerUrl,
        healthcheck: config.healthcheck.url,
      },
      `DWCode server listening on http://localhost:${config.port}`,
    );
  });

  // Slowloris protection; Node's defaults are generous.
  server.headersTimeout = 65_000;
  server.requestTimeout = 60_000;

  if (config.healthcheck.enabled) container.upstreamHealth.startHeartbeat();

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");

    container.upstreamHealth.stopHeartbeat();

    server.close((err) => {
      if (err) {
        logger.error({ err }, "error while closing HTTP server");
        process.exit(1);
      }
      // Close the DB only after in-flight requests have drained.
      void disconnectDatabase()
        .catch((dbErr: unknown) => logger.error({ err: dbErr }, "error closing mongodb"))
        .finally(() => {
          logger.info("shutdown complete");
          process.exit(0);
        });
    });

    // Don't hang forever on stuck keep-alive sockets.
    setTimeout(() => {
      logger.warn("forcing shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "unhandled promise rejection");
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaught exception — exiting");
    process.exit(1);
  });
}

await main();
