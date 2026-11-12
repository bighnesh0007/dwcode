/**
 * Mongoose connection lifecycle.
 *
 * Unlike the frontend's globalThis-cached connection (which existed to survive Next's
 * hot reload), this is a long-lived process, so a plain module-level singleton is
 * enough. Connecting is explicit and happens once in server.ts.
 */
import mongoose from "mongoose";
import { config } from "../config/index.ts";
import { logger } from "../lib/logger.ts";

let connected = false;

export function isDatabaseConnected(): boolean {
  // Compare against the enum rather than the literal 1 so the intent is explicit.
  return connected && mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function connectDatabase(): Promise<void> {
  if (connected) return;

  const uri = config.mongoUri;
  if (!uri) {
    logger.warn("MONGODB_URI is not set — database features are disabled");
    return;
  }

  mongoose.connection.on("connected", () => logger.info("mongodb connected"));
  mongoose.connection.on("disconnected", () => logger.warn("mongodb disconnected"));
  mongoose.connection.on("error", (err) => logger.error({ err }, "mongodb error"));

  await mongoose.connect(uri, {
    bufferCommands: false,
    // Fail fast rather than hanging a request for 30s on an unreachable cluster.
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
    // Opt-in only (MONGO_AUTO_INDEX). It used to be on whenever NODE_ENV was not
    // "production" — so a local dev server with the production URI wrote
    // indexes to production the moment a model loaded.
    autoIndex: config.mongoAutoIndex,
  });

  connected = true;
}

export async function disconnectDatabase(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}
