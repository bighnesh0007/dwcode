/**
 * Background jobs behind one interface, two implementations:
 *
 *   BullMqJobQueue  Redis-backed (BullMQ). Production: jobs survive a restart,
 *                   any instance can serve a status poll, workers on every
 *                   instance drain one shared queue.
 *   InlineJobQueue  In-process. Dev and tests (no Redis): same states, same
 *                   retry rules, gone on restart.
 *
 * Spike control: the queue has a depth cap. Past it, enqueue refuses at once
 * (QueueFullError → 503) instead of accepting work it cannot finish in time —
 * a contest-start burst becomes a bounded, draining backlog, not an outage.
 *
 * Retries: only errors marked retryable (the compiler being unavailable) are
 * retried, with exponential backoff. Anything else — problem not found, a bug —
 * fails at once: retrying a deterministic failure only burns capacity.
 */
import { Queue, UnrecoverableError, Worker, type ConnectionOptions, type Job } from "bullmq";
import { LRUCache } from "lru-cache";
import { randomUUID } from "node:crypto";
import { CompilerUnavailableError, AppError } from "../../errors/AppError.ts";
import { contextLogger, logger } from "../../lib/logger.ts";

export type JobState = "queued" | "active" | "completed" | "failed";

export interface JobStatus<TData, TResult> {
  id: string;
  state: JobState;
  data: TData;
  result?: TResult;
  /** Stable code + safe message, for the caller to branch on and show. */
  error?: { code: string; message: string };
  /** Approximate number of jobs ahead of this one, while queued. */
  position?: number;
}

export interface JobQueue<TData, TResult> {
  enqueue(data: TData): Promise<{ id: string }>;
  status(id: string): Promise<JobStatus<TData, TResult> | null>;
  close(): Promise<void>;
}

/** A CompilerUnavailableError, so it gets the same 503 + Retry-After handling. */
export class QueueFullError extends CompilerUnavailableError {
  constructor() {
    super("Submissions are queued to capacity. Retry in a few seconds.", 10);
  }
}

export interface QueueOptions {
  /** Jobs graded at once per process. */
  concurrency: number;
  /** Total attempts for a retryable failure. */
  attempts: number;
  /** First retry delay; doubles each attempt. */
  backoffMs: number;
  /** Refuse new jobs past this many waiting. */
  maxWaiting: number;
  /** How long a finished job's result can still be polled. */
  resultTtlMs: number;
  /** Which failures to retry. Default: only an unavailable compiler. */
  retryIf?: (err: unknown) => boolean;
}

/** Default: only an unavailable compiler is worth retrying. */
function compilerUnavailable(err: unknown): boolean {
  return err instanceof CompilerUnavailableError;
}

function toJobError(err: unknown): { code: string; message: string } {
  if (err instanceof AppError && err.expose) return { code: err.code, message: err.message };
  return { code: "INTERNAL", message: "Grading failed unexpectedly." };
}

// ── BullMQ ────────────────────────────────────────────────────────────────────

export class BullMqJobQueue<TData extends object, TResult> implements JobQueue<TData, TResult> {
  private readonly queue: Queue;
  private readonly worker: Worker;

  constructor(
    name: string,
    connection: ConnectionOptions,
    handler: (data: TData) => Promise<TResult>,
    private readonly opts: QueueOptions,
  ) {
    this.queue = new Queue(name, {
      connection,
      defaultJobOptions: {
        attempts: opts.attempts,
        backoff: { type: "exponential", delay: opts.backoffMs },
        removeOnComplete: { age: Math.ceil(opts.resultTtlMs / 1000) },
        removeOnFail: { age: Math.ceil(opts.resultTtlMs / 1000) },
      },
    });
    this.worker = new Worker(
      name,
      async (job: Job) => {
        try {
          return await handler(job.data as TData);
        } catch (err) {
          if ((opts.retryIf ?? compilerUnavailable)(err)) throw err;
          // Deterministic failure: tell BullMQ not to retry, but keep the
          // stable code for the poller.
          const e = toJobError(err);
          throw new UnrecoverableError(JSON.stringify(e));
        }
      },
      { connection, concurrency: opts.concurrency },
    );
    this.worker.on("failed", (job, err) => {
      logger.warn({ jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, `[queue:${name}] job failed`);
    });
    this.worker.on("error", (err) => logger.error({ err }, `[queue:${name}] worker error`));
  }

  async enqueue(data: TData): Promise<{ id: string }> {
    if ((await this.queue.getWaitingCount()) >= this.opts.maxWaiting) throw new QueueFullError();
    const id = randomUUID();
    await this.queue.add("job", data, { jobId: id });
    return { id };
  }

  async status(id: string): Promise<JobStatus<TData, TResult> | null> {
    // State FIRST, then the job hash. BullMQ writes the return value and the
    // state change in one atomic script, so a hash read after seeing
    // "completed" always holds the result. The other order raced: a hash read
    // while active plus a state read after completion = completed, no result
    // (the intermittent "runs a job" test failure, and a verdict-less poll).
    const state = await this.queue.getJobState(id);
    if (state === "unknown") return null;
    const job = await this.queue.getJob(id);
    if (!job) return null;
    const base = { id, data: job.data as TData };
    if (state === "completed") return { ...base, state: "completed", result: job.returnvalue as TResult };
    if (state === "failed") return { ...base, state: "failed", error: parseFailure(job.failedReason) };
    if (state === "active") return { ...base, state: "active" };
    // waiting, delayed (between retries), prioritized, waiting-children
    return { ...base, state: "queued", position: await this.queue.getWaitingCount() };
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

function parseFailure(reason: string | undefined): { code: string; message: string } {
  try {
    const parsed = JSON.parse(reason ?? "") as { code?: unknown; message?: unknown };
    if (typeof parsed.code === "string" && typeof parsed.message === "string") {
      return { code: parsed.code, message: parsed.message };
    }
  } catch {
    // a retryable error that exhausted its attempts: its message is ours and safe
  }
  return { code: "COMPILER_UNAVAILABLE", message: "The compiler is unavailable. Your submission was not recorded — please submit again." };
}

// ── Inline (no Redis) ─────────────────────────────────────────────────────────

export class InlineJobQueue<TData, TResult> implements JobQueue<TData, TResult> {
  private readonly jobs: LRUCache<string, JobStatus<TData, TResult>>;
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly handler: (data: TData) => Promise<TResult>,
    private readonly opts: QueueOptions,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.jobs = new LRUCache({ max: 10_000, ttl: opts.resultTtlMs });
  }

  enqueue(data: TData): Promise<{ id: string }> {
    if (this.waiting.length >= this.opts.maxWaiting) return Promise.reject(new QueueFullError());
    const id = randomUUID();
    this.jobs.set(id, { id, state: "queued", data });
    void this.run(id, data);
    return Promise.resolve({ id });
  }

  status(id: string): Promise<JobStatus<TData, TResult> | null> {
    return Promise.resolve(this.jobs.get(id) ?? null);
  }

  /** Test hook: resolves when every job enqueued so far has finished. */
  async drain(): Promise<void> {
    while (this.running > 0 || this.waiting.length > 0) await new Promise((r) => setTimeout(r, 5));
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  private async run(id: string, data: TData): Promise<void> {
    if (this.running >= this.opts.concurrency) await new Promise<void>((r) => this.waiting.push(r));
    this.running += 1;
    this.jobs.set(id, { id, state: "active", data });
    try {
      for (let attempt = 1; ; attempt++) {
        try {
          const result = await this.handler(data);
          this.jobs.set(id, { id, state: "completed", data, result });
          return;
        } catch (err) {
          const retryable = (this.opts.retryIf ?? compilerUnavailable)(err);
          if (!retryable || attempt >= this.opts.attempts) {
            contextLogger().warn({ jobId: id, attempt, err }, "[queue:inline] job failed");
            this.jobs.set(id, { id, state: "failed", data, error: retryable ? parseFailure(undefined) : toJobError(err) });
            return;
          }
          await this.sleep(this.opts.backoffMs * 2 ** (attempt - 1));
        }
      }
    } finally {
      this.running -= 1;
      this.waiting.shift()?.();
    }
  }
}
