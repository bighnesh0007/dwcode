/**
 * Composition root: the one place concrete implementations are chosen and wired.
 *
 * Plain constructor injection — no DI framework, no decorators, no reflect-metadata.
 * Everything a service needs arrives through its constructor, which is what makes the
 * tests fake-able (see tests/helpers/buildTestApp.ts).
 *
 * Overrides let tests replace any dependency (fetch, clock, stores) wholesale.
 */
import { Redis } from "ioredis";
import { RedisStore } from "rate-limit-redis";
import { config } from "./config/index.ts";
import { logger } from "./lib/logger.ts";
import { MemoryKeyValueStore } from "./lib/store/memoryStore.ts";
import { RedisKeyValueStore } from "./lib/store/redisStore.ts";
import { useRateLimitStore } from "./middleware/rateLimit.ts";
import { CompilerController } from "./controllers/compiler.controller.ts";
import { CompilerServiceClient } from "./services/compiler/compilerService.client.ts";
import { LegacyTransformController } from "./controllers/legacy/transform.legacy.controller.ts";
import { SponsorshipController } from "./controllers/sponsorship.controller.ts";
import { ContestRepository } from "./repositories/contest.repository.ts";
import { ProblemRepository } from "./repositories/problem.repository.ts";
import { SponsorshipRepository } from "./repositories/sponsorship.repository.ts";
import { WeeklyContestService } from "./services/contest/weeklyContest.service.ts";
import { DataWeaveClient } from "./services/dataweave/dataweave.client.ts";
import { UpstreamHealthService } from "./services/dataweave/upstreamHealth.service.ts";
import {
  ClerkTokenVerifier,
  DisabledTokenVerifier,
} from "./services/identity/clerkTokenVerifier.ts";
import { RazorpayClient } from "./services/payment/razorpay.client.ts";
import { SponsorshipService } from "./services/payment/sponsorship.service.ts";
import {
  systemClock,
  type Clock,
  type FetchLike,
  type KeyValueStore,
  type TokenVerifier,
} from "./types/ports.ts";

export interface ContainerOverrides {
  fetchImpl?: FetchLike;
  /** Force the compiler backend in tests, independent of env. */
  compiler?: { url: string; authToken: string; timeoutMs?: number; cacheTtlMs?: number };
  clock?: Clock;
  store?: KeyValueStore;
  tokenVerifier?: TokenVerifier;
}

export interface Container {
  // infrastructure
  store: KeyValueStore;
  /** Present when REDIS_URL is set. Closed on shutdown. */
  redis?: Redis;
  clock: Clock;
  tokenVerifier: TokenVerifier;
  // services
  dataweaveClient: DataWeaveClient;
  /** Present when DW_BACKEND=service (or a test override). */
  compilerService?: CompilerServiceClient;
  upstreamHealth: UpstreamHealthService;
  sponsorshipService: SponsorshipService;
  weeklyContest: WeeklyContestService;
  // controllers
  legacyTransformController: LegacyTransformController;
  sponsorshipController: SponsorshipController;
  compilerController: CompilerController;
}

export function buildContainer(overrides: ContainerOverrides = {}): Container {
  const clock = overrides.clock ?? systemClock;
  const fetchImpl: FetchLike = overrides.fetchImpl ?? ((input, init) => fetch(input, init));
  // ── Shared state ───────────────────────────────────────────────────────────
  // Redis when configured, so limits and caches are shared across instances.
  // Without it everything still works, per process — correct for one instance.
  const redis = !overrides.store && config.redisUrl ? connectRedis(config.redisUrl) : undefined;
  const store = overrides.store ?? (redis ? new RedisKeyValueStore(redis) : new MemoryKeyValueStore({ max: 20_000 }));
  if (redis) {
    useRateLimitStore(
      (policy) =>
        new RedisStore({
          prefix: `dwc:rl:${policy}:`,
          sendCommand: (command: string, ...args: string[]) =>
            redis.call(command, ...args) as Promise<never>,
        }),
    );
  }

  // ── Identity ───────────────────────────────────────────────────────────────
  // Fails closed when Clerk is unconfigured, rather than silently allowing traffic.
  const tokenVerifier: TokenVerifier =
    overrides.tokenVerifier ??
    (config.clerk.secretKey
      ? new ClerkTokenVerifier(config.clerk.secretKey, config.clerk.authorizedParties)
      : new DisabledTokenVerifier());

  // ── DataWeave ──────────────────────────────────────────────────────────────
  const compilerSettings =
    overrides.compiler ??
    (config.compiler.backend === "service" && config.compiler.serviceUrl && config.compiler.authToken
      ? { url: config.compiler.serviceUrl, authToken: config.compiler.authToken, timeoutMs: config.compiler.timeoutMs }
      : undefined);
  const compilerService = compilerSettings
    ? new CompilerServiceClient(
        {
          url: compilerSettings.url,
          authToken: compilerSettings.authToken,
          timeoutMs: compilerSettings.timeoutMs ?? config.compiler.timeoutMs,
          // Short on purpose: it also bounds how long results from a previous
          // engine version can be served after an engine upgrade.
          cacheTtlMs: compilerSettings.cacheTtlMs ?? 5 * 60_000,
          cacheMaxOutputBytes: 64 * 1024,
        },
        fetchImpl,
        store,
        clock,
      )
    : undefined;

  const dataweaveClient = new DataWeaveClient(
    {
      url: config.dataweave.compilerUrl,
      version: config.dataweave.version,
      timeoutMs: config.dataweave.timeoutMs,
    },
    fetchImpl,
    compilerService,
  );

  const compilerController = new CompilerController(compilerService);

  const upstreamHealth = new UpstreamHealthService(
    { url: config.healthcheck.url, intervalMs: config.healthcheck.intervalMs },
    fetchImpl,
    clock,
  );

  const legacyTransformController = new LegacyTransformController(
    dataweaveClient,
    upstreamHealth,
  );

  // ── Payments ───────────────────────────────────────────────────────────────
  const razorpayClient = new RazorpayClient(
    config.razorpay.keyId && config.razorpay.keySecret
      ? { keyId: config.razorpay.keyId, keySecret: config.razorpay.keySecret }
      : undefined,
    fetchImpl,
  );

  const sponsorshipService = new SponsorshipService(
    razorpayClient,
    new SponsorshipRepository(),
    {
      ...(config.razorpay.keySecret ? { keySecret: config.razorpay.keySecret } : {}),
      ...(config.razorpay.webhookSecret ? { webhookSecret: config.razorpay.webhookSecret } : {}),
      currency: config.razorpay.currency,
    },
    clock,
  );

  const sponsorshipController = new SponsorshipController(sponsorshipService);

  // ── Weekly contest ─────────────────────────────────────────────────────────
  const weeklyContest = new WeeklyContestService(
    new ContestRepository(),
    new ProblemRepository(),
    clock,
  );

  return {
    store,
    ...(redis ? { redis } : {}),
    clock,
    tokenVerifier,
    dataweaveClient,
    ...(compilerService ? { compilerService } : {}),
    upstreamHealth,
    sponsorshipService,
    weeklyContest,
    legacyTransformController,
    sponsorshipController,
    compilerController,
  };
}

function connectRedis(url: string): Redis {
  const redis = new Redis(url, {
    // Fail a command fast instead of queueing it forever while disconnected;
    // every caller degrades gracefully (rate limits fail open, cache misses).
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 5_000,
  });
  redis.on("error", (err) => logger.warn({ err }, "redis error"));
  return redis;
}
