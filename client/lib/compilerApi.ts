/**
 * Run and Submit through server/ (ADR-006), used when COMPILER_VIA_API is on.
 *
 *   run     POST /api/v1/compiler/run — straight to the compiler service
 *   submit  POST /api/v1/submissions  — queued; then poll the job until it settles
 *
 * Both return a discriminated result instead of throwing, so the UI must handle
 * the case that matters: `unavailable` means our compiler or queue failed and
 * NOTHING was recorded — the user should simply try again. It is never shown as
 * a wrong answer.
 */
import type { GradeResult } from "@dwcode/shared";
import { ApiError, apiRequest } from "./apiClient";
import { explainCompilerError } from "./compilerErrors";

type GetToken = () => Promise<string | null>;

/**
 * Clerk's getToken() never settles while Clerk is still loading or failed to
 * load (blocked CDN, extension, flaky network). Run is allowed signed out, so it
 * must not hang on that: give up after a moment and go anonymous. Submit then
 * gets a clean 401 instead of a frozen button.
 */
const TOKEN_WAIT_MS = 1_500;
function tokenOrNull(getToken: GetToken): Promise<string | null> {
  return Promise.race([
    getToken().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), TOKEN_WAIT_MS)),
  ]);
}

interface RunData {
  ok: boolean;
  output?: string;
  error?: { kind: string; message: string };
  timeMs: number;
  cached: boolean;
}

export type RunOutcome =
  | { kind: "ok"; output: string; timeMs: number }
  | { kind: "error"; message: string }
  | { kind: "unavailable"; message: string };

export async function runViaApi(code: string, input: string, getToken: GetToken): Promise<RunOutcome> {
  try {
    const data = await apiRequest<RunData>("/api/v1/compiler/run", {
      method: "POST",
      token: await tokenOrNull(getToken),
      body: { script: code, inputs: [{ name: "payload", value: input || "{}" }] },
    });
    if (data.ok) return { kind: "ok", output: data.output ?? "", timeMs: data.timeMs };
    return { kind: "error", message: explainCompilerError(data.error?.message ?? "Execution failed.") };
  } catch (err) {
    return fromApiError(err);
  }
}

export type SubmitOutcome =
  | { kind: "graded"; result: GradeResult & { submissionId: string } }
  | { kind: "error"; message: string }
  | { kind: "unavailable"; message: string };

interface JobData {
  state: "queued" | "active" | "completed" | "failed";
  position?: number;
  result?: GradeResult & { submissionId: string };
  error?: { code: string; message: string };
}

/** Poll interval and ceiling. Grading takes milliseconds per case; the ceiling covers a backlog. */
const POLL_MS = 500;
const MAX_WAIT_MS = 120_000;

export async function submitViaApi(
  body: { problemId: string; code: string; input?: string },
  getToken: GetToken,
  onProgress: (message: string) => void,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<SubmitOutcome> {
  let jobId: string;
  try {
    ({ jobId } = await apiRequest<{ jobId: string }>("/api/v1/submissions", {
      method: "POST",
      token: await tokenOrNull(getToken),
      body,
    }));
  } catch (err) {
    return fromApiError(err);
  }

  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    let job: JobData;
    try {
      // A fresh token per poll: Clerk session tokens live ~60s.
      job = await apiRequest<JobData>(`/api/v1/submissions/jobs/${jobId}`, { token: await tokenOrNull(getToken) });
    } catch (err) {
      // A failed poll is not a failed submission; keep waiting until the deadline.
      if (err instanceof ApiError && err.status === 404) return { kind: "error", message: "Submission not found." };
      continue;
    }
    if (job.state === "completed" && job.result) return { kind: "graded", result: job.result };
    if (job.state === "failed") {
      const e = job.error ?? { code: "INTERNAL", message: "Grading failed." };
      return e.code === "COMPILER_UNAVAILABLE"
        ? { kind: "unavailable", message: e.message }
        : { kind: "error", message: e.message };
    }
    onProgress(
      job.state === "queued" && job.position
        ? `⏳ Queued — ${job.position} ahead of you…`
        : "⏳ Evaluating test cases…",
    );
  }
  // Still running server-side: it may yet be recorded, so say exactly that.
  return { kind: "unavailable", message: "Grading is taking longer than usual. Check your submission history in a minute." };
}

function fromApiError(err: unknown): { kind: "error" | "unavailable"; message: string } {
  if (err instanceof ApiError) {
    if (err.code === "COMPILER_UNAVAILABLE" || err.code === "NOT_CONFIGURED" || err.status >= 500) {
      return { kind: "unavailable", message: err.message };
    }
    if (err.code === "RATE_LIMITED") return { kind: "error", message: "You're going a bit fast — wait a moment and try again." };
    return { kind: "error", message: err.message };
  }
  // fetch itself failed: network down or API unreachable.
  return { kind: "unavailable", message: "Could not reach the server. Check your connection and try again." };
}
