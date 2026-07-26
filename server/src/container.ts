/**
 * Composition root: the one place concrete implementations are chosen and wired.
 *
 * Plain constructor injection — no DI framework, no decorators, no reflect-metadata.
 * Everything a service needs arrives through its constructor, which is what makes the
 * tests fake-able (see tests/helpers/buildTestApp.ts).
 *
 * Overrides let tests replace any dependency (fetch, clock, stores) wholesale.
 */
import { config } from "./config/index.ts";
import { MemoryKeyValueStore } from "./lib/store/memoryStore.ts";
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
  clock?: Clock;
  store?: KeyValueStore;
  tokenVerifier?: TokenVerifier;
}

export interface Container {
  // infrastructure
  store: KeyValueStore;
  clock: Clock;
  tokenVerifier: TokenVerifier;
  // services
  dataweaveClient: DataWeaveClient;
  upstreamHealth: UpstreamHealthService;
  sponsorshipService: SponsorshipService;
  weeklyContest: WeeklyContestService;
  // controllers
  legacyTransformController: LegacyTransformController;
  sponsorshipController: SponsorshipController;
}

export function buildContainer(overrides: ContainerOverrides = {}): Container {
  const clock = overrides.clock ?? systemClock;
  const fetchImpl: FetchLike = overrides.fetchImpl ?? ((input, init) => fetch(input, init));
  const store = overrides.store ?? new MemoryKeyValueStore({ max: 20_000 });

  // ── Identity ───────────────────────────────────────────────────────────────
  // Fails closed when Clerk is unconfigured, rather than silently allowing traffic.
  const tokenVerifier: TokenVerifier =
    overrides.tokenVerifier ??
    (config.clerk.secretKey
      ? new ClerkTokenVerifier(config.clerk.secretKey, config.clerk.authorizedParties)
      : new DisabledTokenVerifier());

  // ── DataWeave ──────────────────────────────────────────────────────────────
  const dataweaveClient = new DataWeaveClient(
    {
      url: config.dataweave.compilerUrl,
      version: config.dataweave.version,
      timeoutMs: config.dataweave.timeoutMs,
    },
    fetchImpl,
  );

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
    clock,
    tokenVerifier,
    dataweaveClient,
    upstreamHealth,
    sponsorshipService,
    weeklyContest,
    legacyTransformController,
    sponsorshipController,
  };
}
