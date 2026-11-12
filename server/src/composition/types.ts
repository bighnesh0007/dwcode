/**
 * What a domain module receives from the composition root. Every domain builds
 * its own repositories/services/controllers from these and returns a router;
 * container.ts and routes/v1/index.ts never need to change per domain.
 */
import type { Router } from "express";
import type { Clock, FetchLike, IdentityProvider, KeyValueStore, TokenVerifier } from "../types/ports.ts";

export interface DomainDeps {
  tokenVerifier: TokenVerifier;
  identity: IdentityProvider;
  store: KeyValueStore;
  fetchImpl: FetchLike;
  clock: Clock;
}

export interface DomainModule {
  /** Mount path under /api/v1, e.g. "/problems". */
  path: string;
  router: Router;
}
