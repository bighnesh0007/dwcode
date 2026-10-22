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
import { SubmissionController } from "./controllers/submission.controller.ts";
import { CoinsRepository } from "./repositories/coins.repository.ts";
import { GitHubRepository } from "./repositories/github.repository.ts";
import { SubmissionRepository } from "./repositories/submission.repository.ts";
import { SolutionPublisher, type PublishSolutionJob } from "./services/github/solutionPublisher.ts";
import { GradingService } from "./services/grading/grading.service.ts";
import { ClerkIdentityProvider, NullIdentityProvider } from "./services/identity/clerkIdentityProvider.ts";
import { BullMqJobQueue, InlineJobQueue, type JobQueue, type QueueOptions } from "./services/queue/jobQueue.ts";
import { SubmissionService, type SubmitCommand, type SubmitOutcome } from "./services/submission/submission.service.ts";
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
  type IdentityProvider,
  type KeyValueStore,
  type TokenVerifier,
} from "./types/ports.ts";

export interface ContainerOverrides {
  fetchImpl?: FetchLike;
  /** Force the compiler backend in tests, independent of env. `null` forces the legacy upstream path. */
  compiler?: { url: string; authToken: string; timeoutMs?: number; cacheTtlMs?: number } | null;
  clock?: Clock;
  store?: KeyValueStore;
  tokenVerifier?: TokenVerifier;
  identityProvider?: IdentityProvider;
  /** Use an in-process queue even when REDIS_URL is set. */
  inlineQueues?: boolean;
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
  /** Present when the compiler service is configured: grading needs it. */
  submissionController?: SubmissionController;
  /** Background queues, closed on shutdown. */
  queues: JobQueue<never, unknown>[];
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
    overrides.compiler === null
      ? undefined
      : (overrides.compiler ??
        (config.compiler.backend === "service"
          ? { url: config.compiler.serviceUrl, authToken: config.compiler.authToken, timeoutMs: config.compiler.timeoutMs }
          : undefined));
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

  // ── Submissions (graded in the background) ─────────────────────────────────
  const queues: JobQueue<never, unknown>[] = [];
  const bullUrl = redis && !overrides.inlineQueues ? config.redisUrl : undefined;
  const makeQueue = <D extends object, R>(name: string, handler: (d: D) => Promise<R>, opts: QueueOptions): JobQueue<D, R> => {
    const q: JobQueue<D, R> = bullUrl
      ? new BullMqJobQueue<D, R>(name, bullConnection(bullUrl), handler, opts)
      : new InlineJobQueue<D, R>(handler, opts);
    queues.push(q as unknown as JobQueue<never, unknown>);
    return q;
  };

  let submissionController: SubmissionController | undefined;
  if (compilerService) {
    const problems = new ProblemRepository();
    const submissions = new SubmissionRepository();
    const publisher = new SolutionPublisher(new GitHubRepository(), submissions, problems, fetchImpl);
    // GitHub is a third party: retry every failure, slowly, a few times.
    const publishQueue = makeQueue<PublishSolutionJob, boolean>("github-publish", (job) => publisher.publish(job), {
      concurrency: 2,
      attempts: 4,
      backoffMs: 30_000,
      maxWaiting: 10_000,
      resultTtlMs: 24 * 60 * 60_000,
      retryIf: () => true,
    });
    const identity =
      overrides.identityProvider ??
      (config.clerk.secretKey ? new ClerkIdentityProvider(config.clerk.secretKey) : new NullIdentityProvider());
    const submissionService = new SubmissionService(
      problems,
      submissions,
      new CoinsRepository(),
      identity,
      new GradingService(compilerService, config.grading.hiddenTests),
      async (job) => {
        await publishQueue.enqueue(job);
      },
    );
    const gradingQueue = makeQueue<SubmitCommand, SubmitOutcome>("grading", (cmd) => submissionService.submit(cmd), {
      concurrency: config.grading.concurrency,
      attempts: 3,
      backoffMs: 2_000,
      maxWaiting: config.grading.maxQueued,
      resultTtlMs: 60 * 60_000,
    });
    submissionController = new SubmissionController(gradingQueue, submissions);
  }

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
    ...(submissionController ? { submissionController } : {}),
    queues,
  };
}

/** BullMQ needs its own connection with no per-command retry cap (it blocks on purpose). */
function bullConnection(url: string): Redis {
  const conn = new Redis(url, { maxRetriesPerRequest: null });
  conn.on("error", (err) => logger.warn({ err }, "redis (queue) error"));
  return conn;
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
