/**
 * Builds the Express application. NEVER calls `listen()` — that belongs to
 * server.ts, which is what lets supertest drive the app without binding a port.
 */
import express, { type Application } from "express";
import compression from "compression";
import { config } from "./config/index.ts";
import type { Container } from "./container.ts";
import { errorHandler } from "./middleware/errorHandler.ts";
import { requestContext } from "./middleware/requestContext.ts";
import { securityHeaders } from "./middleware/security.ts";
import { mountRoutes } from "./routes/index.ts";

export function buildApp(container: Container): Application {
  const app = express();

  // Render (and most PaaS) terminate TLS upstream; without this, client IPs used
  // for rate limiting would all be the proxy's.
  if (config.http.trustProxy) app.set("trust proxy", 1);

  // Never advertise the framework.
  app.disable("x-powered-by");
  // `?a[b]=c` should not become a nested object we then have to reason about.
  app.set("query parser", "simple");

  app.use(securityHeaders());
  app.use(compression());
  app.use(requestContext);

  // NOTE: no global body parser. Each router declares its own limit, because the
  // legacy transform endpoint needs 5mb while most v1 endpoints should not.
  mountRoutes(app, container);

  // Must be last.
  app.use(errorHandler);

  return app;
}
