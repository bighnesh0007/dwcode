/**
 * Hard limits enforced by validation, grading and the playground.
 *
 * Previously these lived only in server/src/config/constants.ts, where the
 * client could not reach them — so client/lib/grading.ts restated MAX_TESTS,
 * TOTAL_BUDGET_MS and MAX_CODE_LENGTH by hand (audit risk M1-R5).
 */
export const LIMITS = {
  body: {
    legacy: "5mb",
    default: "1mb",
    text: "256kb",
  },
  grading: {
    /** Never run more than this many test cases for one submission. */
    maxTests: 24,
    /** Total wall-clock budget across all test-case executions. */
    totalBudgetMs: 25_000,
    /** Concurrent compiler calls per submission. */
    concurrency: 3,
    /** Per-test compiler timeout. */
    perTestTimeoutMs: 15_000,
  },
  code: {
    maxLength: 50_000,
  },
  playground: {
    maxScriptLength: 50_000,
    maxFiles: 12,
    maxFileLength: 100_000,
    maxTestCases: 20,
  },
  comment: {
    maxLength: 2000,
  },
  note: {
    maxLength: 20_000,
  },
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
} as const;
