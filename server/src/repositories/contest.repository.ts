/**
 * Contest persistence for background jobs. Mongoose queries only — no business
 * rules here.
 */
import type mongoose from "mongoose";
import { Contest } from "../models/Contest.ts";

/** Everything the weekly scheduler writes when it creates a contest. */
export interface ContestCreateInput {
  seriesKey: string;
  title: string;
  description: string;
  createdBy: string;
  createdByName: string;
  problems: mongoose.Types.ObjectId[];
  problemSlugs: string[];
  startTime: Date;
  endTime: Date;
  duration: number;
  status: "upcoming";
  isPublic: boolean;
  maxParticipants: number;
  participants: never[];
}

export class ContestRepository {
  /**
   * Builds any missing indexes for the Contest collection — most importantly the
   * `seriesKey` unique sparse index that the weekly scheduler's race guard relies
   * on. This MUST be called deliberately because db/connection.ts disables
   * autoIndex in production, and the `contests` collection already exists there
   * (created by the client app, whose schema has no seriesKey). Without this call
   * the duplicate-key race guard would be silently absent in prod. Idempotent:
   * createIndexes only builds what is missing.
   */
  async ensureIndexes(): Promise<void> {
    await Contest.createIndexes();
  }

  async existsBySeriesKey(key: string): Promise<boolean> {
    return (await Contest.exists({ seriesKey: key })) !== null;
  }

  /**
   * Creates the contest. Deliberately catches NOTHING — the duplicate-key error
   * from the `seriesKey` unique index is how the service detects that a
   * concurrent instance won the scheduling race.
   */
  async create(doc: ContestCreateInput): Promise<void> {
    await Contest.create(doc);
  }
}
