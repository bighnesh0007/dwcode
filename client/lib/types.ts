/**
 * The JSON shapes the API (server/) returns. Written out rather than derived
 * from Mongoose schemas: this app no longer talks to the database, so it must
 * not depend on its models. Ids and dates arrive as strings.
 *
 * Difficulty is a string because the tiers come from @dwcode/shared's
 * registry, not from a hand-written union (CLAUDE.md).
 */
export type Difficulty = string;

export interface Example {
  input: string;
  output: string;
  explanation?: string;
}

export interface TestCase {
  input: string;
  expectedOutput: string;
}

export interface Problem {
  _id: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  category: string;
  tags: string[];
  description: string;
  examples: Example[];
  constraints: string[];
  starterCode: string;
  testCases: TestCase[];
  /** Admins only. */
  hiddenTestCases?: TestCase[];
  /** Admins only; everyone else fetches it on demand (see hasSolution). */
  solution?: string;
  /** Set by the API: whether a solution exists to reveal. */
  hasSolution?: boolean;
  hints: string[];
  createdByAI: boolean;
  createdBy: string;
  createdAt: string;
}

export type ProblemSummary = Pick<
  Problem,
  "_id" | "title" | "slug" | "difficulty" | "category" | "tags" | "description" | "starterCode"
>;
type ProblemListItem = Pick<Problem, "_id" | "title" | "slug" | "difficulty">;

export interface SubmissionSummary {
  _id: string;
  problemId: string;
  problemSlug: string;
  status: "Accepted" | "Attempted" | "Error";
  executionTime: string;
  createdAt: string;
  code: string;
  output: string;
}

export interface BookmarkSummary {
  _id: string;
  problemId: string;
  problemSlug: string;
  userId: string;
  createdAt: string;
}

interface ContestParticipant {
  userId: string;
  userName: string;
  userImageUrl: string;
  score: number;
  solvedProblems: string[];
  joinedAt: string;
  finishedAt?: string;
}

interface ContestBase {
  _id: string;
  title: string;
  description: string;
  createdBy: string;
  createdByName: string;
  problemSlugs: string[];
  startTime: string;
  endTime: string;
  duration: number;
  status: "upcoming" | "active" | "ended";
  isPublic: boolean;
  maxParticipants: number;
  participants: ContestParticipant[];
  /** Creator only. */
  inviteCode?: string;
  createdAt: string;
}

export type ContestSummary = ContestBase & {
  problems: ProblemSummary[];
  participantCount?: number;
  isParticipant?: boolean;
  isCreator?: boolean;
};

export type ContestListItem = Omit<ContestBase, "participants"> & {
  problems: ProblemListItem[];
  participantCount: number;
  isParticipant?: boolean;
};

export interface BlogPost {
  _id: string;
  title: string;
  slug: string;
  content: string;
  authorId: string;
  authorName: string;
  authorImageUrl: string;
  tags: string[];
  published: boolean;
  upvotes: number;
  downvotes: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  _id: string;
  targetType: string;
  targetId: string;
  problemSlug?: string;
  userId: string;
  userName: string;
  userImageUrl: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoinTransaction {
  type: string;
  amount: number;
  description: string;
  createdAt: string;
}
