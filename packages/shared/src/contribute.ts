/**
 * Contribution rules (SFCode parity, Phase E): problem drafts, certification
 * questions and contributor applications. Shared by the server (which
 * enforces them) and the client (which shows them).
 */
export const CONTRIBUTION_KINDS = ["problem", "question", "application"] as const;
export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];

export const CONTRIBUTION_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

/** Open (draft or submitted) items a learner may hold per kind; approved contributors get more. */
export const OPEN_LIMIT = { member: 5, contributor: 25 } as const;

/** Test cases a problem draft needs: at least one shown to learners, at most this many in all. */
export const DRAFT_CASES = { min: 2, max: 12 } as const;

/** Coins paid when a contribution is approved. */
export const CONTRIBUTION_REWARD: Record<Exclude<ContributionKind, "application">, number> = { problem: 25, question: 10 };

export interface DraftCase {
  input: string;
  hidden: boolean;
}

/** 32-bit FNV-1a, hex. */
function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Identifies what an automatic check ran: the solution and the case inputs.
 * Editing either invalidates the check, so a draft can only be submitted with
 * expected outputs the compiler produced for exactly this code.
 */
export function draftFingerprint(solution: string, cases: readonly DraftCase[]): string {
  return fnv1aHex(JSON.stringify([solution, cases.map((c) => c.input)]));
}
