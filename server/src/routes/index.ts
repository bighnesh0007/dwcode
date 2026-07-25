/**
 * Route mounting order matters:
 *   1. legacy  — frozen contract, must win before anything else can shadow it
 *   2. /api/v1 — the new surface
 *   3. 404     — anything unmatched, in the v1 envelope
 */
import type { Application } from "express";
import type { Container } from "../container.ts";
import { legacyDataWeaveRoutes } from "./legacy/dataweave.legacy.routes.ts";
import { v1Routes } from "./v1/index.ts";
import { notFound } from "../middleware/notFound.ts";

export function mountRoutes(app: Application, container: Container): void {
  // 1. Frozen legacy endpoints — first, so nothing can shadow them.
  app.use(legacyDataWeaveRoutes(container.legacyTransformController));

  // 2. /api/v1 — the new surface.
  app.use("/api/v1", v1Routes(container));

  // 3. Unmatched.
  app.use(notFound);
}
