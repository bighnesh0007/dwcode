import mongoose from "mongoose";
import { modelFromSchema } from "./model.ts";

/** A team (SFCode parity, Phase C). A user belongs to at most one team. */
const MemberSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

export const TeamSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  ownerId: { type: String, required: true },
  inviteCode: { type: String, required: true, unique: true },
  /** Listed teams appear in the directory; unlisted ones are invite-only. */
  listed: { type: Boolean, default: true },
  members: [MemberSchema],
  createdAt: { type: Date, default: Date.now },
});

// A multikey unique index: no userId may appear in two teams' member lists.
TeamSchema.index({ "members.userId": 1 }, { unique: true, sparse: true });

export const Team = modelFromSchema("Team", TeamSchema);
