/**
 * User-facing contest rules, ported from client/app/api/contests/**.
 *
 * Identity (id, display name, avatar) always comes from the verified token and
 * the identity provider — never from the request body. Joins are a single
 * conditional update in the repository, so a double-join or an over-capacity
 * join cannot happen under concurrency; this service only explains the refusal.
 */
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../errors/AppError.ts";
import { ErrorCode } from "../../errors/codes.ts";
import type { ContestQueryRepository } from "../../repositories/contest.repository.ts";
import type { Clock, IdentityProvider } from "../../types/ports.ts";
import type { CreateContestInput } from "../../validation/contest.schema.ts";

export type ContestStatus = "upcoming" | "active" | "ended";

/** Default from the Next route when the creator does not set a cap. */
const DEFAULT_MAX_PARTICIPANTS = 100;

export function computeStatus(start: Date, end: Date, now: Date): ContestStatus {
  if (now < start) return "upcoming";
  if (now > end) return "ended";
  return "active";
}

function generateInviteCode(): string {
  // 6 bytes → 8 base64url chars. (The Next route used 5 bytes, which only ever
  // produced 7 characters despite the slice(0, 8).)
  return randomBytes(6).toString("base64url").toUpperCase();
}

interface ParticipantLike {
  userId?: string;
}

function participantsOf(contest: Record<string, unknown>): ParticipantLike[] {
  return Array.isArray(contest.participants) ? (contest.participants as ParticipantLike[]) : [];
}

export class ContestService {
  constructor(
    private readonly contests: ContestQueryRepository,
    private readonly identity: IdentityProvider,
    private readonly clock: Clock,
  ) {}

  async list(userId: string | undefined): Promise<Record<string, unknown>[]> {
    const filter = userId
      ? { $or: [{ isPublic: true }, { createdBy: userId }, { "participants.userId": userId }] }
      : { isPublic: true };
    const now = this.clock.now();
    const rows = await this.contests.list(filter);
    return rows.map((c) => {
      const participants = participantsOf(c);
      // Participants (and thus other users' ids) are not part of the list view.
      const { inviteCode, ...rest } = c;
      delete rest.participants;
      return {
        ...rest,
        status: computeStatus(new Date(c.startTime as Date), new Date(c.endTime as Date), now),
        participantCount: participants.length,
        isParticipant: Boolean(userId && participants.some((p) => p.userId === userId)),
        ...(userId && c.createdBy === userId && inviteCode !== undefined ? { inviteCode } : {}),
      };
    });
  }

  async detail(id: string, userId: string | undefined): Promise<Record<string, unknown>> {
    const c = await this.contests.findDetail(id);
    if (!c) throw new NotFoundError("Contest not found.");
    const isCreator = Boolean(userId && c.createdBy === userId);
    const isParticipant = Boolean(userId && participantsOf(c).some((p) => p.userId === userId));
    if (!c.isPublic && !isCreator && !isParticipant) {
      throw new ForbiddenError("Invite required.");
    }
    const { inviteCode, ...rest } = c;
    return {
      ...rest,
      status: computeStatus(new Date(c.startTime as Date), new Date(c.endTime as Date), this.clock.now()),
      ...(isCreator && inviteCode !== undefined ? { inviteCode } : {}),
      isCreator,
      isParticipant,
    };
  }

  async create(userId: string, input: CreateContestInput): Promise<Record<string, unknown>> {
    const problems = await this.contests.findProblemsByIds(input.problemIds);
    // Stricter than the Next route, which stored unknown ids as-is.
    if (problems.length !== new Set(input.problemIds.map((p) => p.toLowerCase())).size) {
      throw new BadRequestError("One or more problems do not exist.");
    }
    const start = input.startTime;
    const end = new Date(start.getTime() + input.duration * 60 * 1000);
    const user = await this.identity.getUser(userId);
    const isPrivate = input.isPublic === false;
    return this.contests.create({
      title: input.title,
      description: input.description ?? "",
      createdBy: userId,
      createdByName: user?.displayName || "Anonymous",
      problems: problems.map((p) => new mongoose.Types.ObjectId(String(p._id))),
      problemSlugs: problems.map((p) => p.slug),
      startTime: start,
      endTime: end,
      duration: input.duration,
      status: computeStatus(start, end, this.clock.now()),
      isPublic: !isPrivate,
      maxParticipants: input.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS,
      ...(isPrivate ? { inviteCode: generateInviteCode() } : {}),
    });
  }

  /** Public join. Idempotent for an existing participant (as in the Next route). */
  async join(id: string, userId: string): Promise<{ alreadyJoined: boolean }> {
    return this.joinInternal(id, userId, { viaInvite: false });
  }

  async joinByCode(rawCode: string, userId: string): Promise<{ contestId: string; alreadyJoined: boolean }> {
    const code = rawCode.trim().toUpperCase();
    const id = await this.contests.findIdByInviteCode(code);
    if (!id) throw new NotFoundError("Invalid invite key.");
    const state = await this.contests.joinState(id, userId);
    // A public contest's code is never a valid invite key (Next route behaviour).
    if (!state || state.isPublic) throw new NotFoundError("Invalid invite key.");
    const r = await this.joinInternal(id, userId, { viaInvite: true });
    return { contestId: id, ...r };
  }

  private async joinInternal(
    id: string,
    userId: string,
    opts: { viaInvite: boolean },
  ): Promise<{ alreadyJoined: boolean }> {
    const user = await this.identity.getUser(userId);
    const now = this.clock.now();
    const outcome = await this.contests.addParticipant(
      id,
      {
        userId,
        userName: user?.displayName || "Anonymous",
        userImageUrl: user?.imageUrl || "",
        score: 0,
        solvedProblems: [],
        joinedAt: now,
      },
      { now, requirePublic: !opts.viaInvite },
    );
    if (outcome === "joined") return { alreadyJoined: false };

    // The update did not apply — re-read to say why.
    const s = await this.contests.joinState(id, userId);
    if (!s) throw new NotFoundError("Contest not found.");
    if (s.isParticipant) return { alreadyJoined: true };
    if (!opts.viaInvite && !s.isPublic) {
      throw new ForbiddenError("Join this private contest with its invite key.");
    }
    if (s.endTime < now) throw new BadRequestError("This contest has ended.");
    if (s.participantCount >= s.maxParticipants) {
      throw new ConflictError("This contest is full.");
    }
    // Lost a race to a state change we cannot name; safe to ask for a retry.
    throw new ConflictError("Could not join the contest. Please retry.");
  }

  async leave(id: string, userId: string): Promise<void> {
    const found = await this.contests.removeParticipant(id, userId);
    if (!found) throw new NotFoundError("Contest not found.");
  }

  async remove(id: string, userId: string): Promise<void> {
    if (await this.contests.deleteOwned(id, userId)) return;
    const owner = await this.contests.findOwner(id);
    if (owner === undefined) throw new NotFoundError("Contest not found.");
    throw new ForbiddenError("Only the contest's creator can delete it.", ErrorCode.NOT_OWNER);
  }
}
