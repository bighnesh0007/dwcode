/**
 * What a domain module receives from the composition root. Every domain builds
 * its own repositories/services/controllers from these and returns a router;
 * container.ts and routes/v1/index.ts never need to change per domain.
 */
import type { Router } from "express";
import type { CompilerServiceClient } from "../services/compiler/compilerService.client.ts";
import type { ProblemGenerator } from "../services/problem/problemGenerator.ts";
import type { Clock, FetchLike, IdentityProvider, KeyValueStore, TokenVerifier } from "../types/ports.ts";

export interface DomainDeps {
  tokenVerifier: TokenVerifier;
  identity: IdentityProvider;
  store: KeyValueStore;
  fetchImpl: FetchLike;
  clock: Clock;
  /** The DataWeave compiler service, when configured (contribution checks). */
  compiler?: CompilerServiceClient | undefined;
  /** Tests only: replaces Gemini behind "explain my error". */
  explainModel?: ProblemGenerator | undefined;
}

export interface DomainModule {
  /** Mount path under /api/v1, e.g. "/problems". */
  path: string;
  router: Router;
}
