import type { InferRawDocTypeFromSchema, Types } from "mongoose";

type Serialized<T> =
  T extends Date | Types.ObjectId ? string
    : T extends readonly (infer Item)[] ? Serialized<Item>[]
      : T extends object ? { [Key in keyof T]: Serialized<T[Key]> }
        : T;

type ProblemDocument = Serialized<
  InferRawDocTypeFromSchema<typeof import("@/models/Problem").ProblemSchema>
>;

type SubmissionDocument = Serialized<
  InferRawDocTypeFromSchema<typeof import("@/models/Submission").SubmissionSchema>
>;

type BookmarkDocument = Serialized<
  InferRawDocTypeFromSchema<typeof import("@/models/Bookmark").BookmarkSchema>
>;

type ContestDocument = Serialized<
  InferRawDocTypeFromSchema<typeof import("@/models/Contest").ContestSchema>
>;

type BlogDocument = Serialized<
  InferRawDocTypeFromSchema<typeof import("@/models/Blog").BlogSchema>
>;

type CommentDocument = Serialized<
  InferRawDocTypeFromSchema<typeof import("@/models/Comment").CommentSchema>
>;

type UserCoinsDocument = Serialized<
  InferRawDocTypeFromSchema<typeof import("@/models/UserCoins").UserCoinsSchema>
>;

export type Difficulty = ProblemDocument["difficulty"];
export type ProblemSummary = Pick<
  ProblemDocument,
  "_id" | "title" | "slug" | "difficulty" | "category" | "tags" | "description" | "starterCode"
>;
type ProblemListItem = Pick<ProblemDocument, "_id" | "title" | "slug" | "difficulty">;
export type Problem = ProblemDocument;
export type SubmissionSummary = SubmissionDocument;
export type BookmarkSummary = BookmarkDocument;

export type ContestSummary = Omit<ContestDocument, "problems"> & {
  problems: ProblemSummary[];
  participantCount?: number;
  isParticipant?: boolean;
  isCreator?: boolean;
};

export type ContestListItem = Omit<ContestDocument, "problems" | "participants"> & {
  problems: ProblemListItem[];
  participantCount: number;
  isParticipant?: boolean;
};

export type BlogPost = BlogDocument;
export type Comment = CommentDocument;
export type CoinTransaction = UserCoinsDocument["transactions"][number];
