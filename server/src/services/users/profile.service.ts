/**
 * Profiles and the follow graph. Replaces the Next.js /api/profile* routes and
 * the direct-Mongoose read in app/profile/[username]/page.tsx.
 *
 * Privacy: the public view never carries userIds, follower lists, emails or
 * anything from Clerk beyond the avatar URL already shown on submissions.
 */
import { BadRequestError, ConflictError, NotFoundError } from "../../errors/AppError.ts";
import type { UserProfileRepository } from "../../repositories/userProfile.repository.ts";
import type { UserStatsRepository } from "../../repositories/userStats.repository.ts";
import type { Clock, IdentityProvider } from "../../types/ports.ts";
import { activityMapOf, countBy, last30Days, scoreOf, streakOf, withLegacyKeys, type ActivityDay } from "./activity.ts";

const MONGO_DUPLICATE_KEY = 11000;
const isDuplicateKey = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === MONGO_DUPLICATE_KEY;

export interface PublicProfileView {
  username: string;
  bio: string;
  followers: number;
  following: number;
  joinedAt: string;
  imageUrl: string;
  isOwnProfile: boolean;
  isFollowing: boolean;
  score: number;
  solved: { total: number; byDifficulty: Record<string, number> };
  problemsByDifficulty: Record<string, number>;
  attempted: number;
  totalSubmissions: number;
  acceptanceRate: number;
  streak: number;
  activityData: ActivityDay[];
  recentLog: { problemSlug: string; status: string; executionTime: string; createdAt: Date }[];
}

export class ProfileService {
  constructor(
    private readonly profiles: UserProfileRepository,
    private readonly stats: UserStatsRepository,
    private readonly identity: IdentityProvider,
    private readonly clock: Clock,
  ) {}

  /** The signed-in user's dashboard. Same shape as GET /api/profile. */
  async dashboard(userId: string) {
    const now = this.clock.now();
    const [totalProblems, byOrigin, problemCounts, subs, bookmarks, githubUsername, profile] = await Promise.all([
      this.stats.countProblems(),
      this.stats.countProblemsByOrigin(),
      this.stats.countProblemsByDifficulty(),
      this.stats.submissionsFor(userId),
      this.stats.countBookmarks(userId),
      this.stats.githubUsername(userId),
      this.profiles.findByUserId(userId),
    ]);

    const { acceptedSlugs, attempted, acceptedCount, acceptanceRate } = summarise(subs);
    const solvedDifficulty = await this.stats.difficultyBySlug([...acceptedSlugs]);
    const solvedBy = countBy(solvedDifficulty.values());

    // The Next.js route built this map from the last 30 days only, so the streak
    // is bounded by that window. Preserved.
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 30);
    const recentMap = activityMapOf(subs.filter((s) => new Date(s.createdAt) >= cutoff).map((s) => s.createdAt));

    return {
      githubConnected: githubUsername !== null,
      githubUsername,
      username: profile?.username ?? null,
      bio: profile?.bio ?? "",
      followers: profile?.followers.length ?? 0,
      following: profile?.following.length ?? 0,
      problems: {
        total: totalProblems,
        ...withLegacyKeys(problemCounts),
        byDifficulty: problemCounts,
        createdByAI: byOrigin.ai,
        createdManually: byOrigin.manual,
      },
      submissions: { total: subs.length, accepted: acceptedCount, acceptanceRate },
      solved: { total: acceptedSlugs.size, ...withLegacyKeys(solvedBy), byDifficulty: solvedBy },
      attempted,
      bookmarks,
      streak: streakOf(recentMap, now),
      activityData: last30Days(recentMap, now),
      recentLog: subs.slice(0, 20).map(logEntry),
    };
  }

  /** Public profile by username (case-insensitive). */
  async publicProfile(username: string, viewerId: string | undefined): Promise<PublicProfileView> {
    const profile = await this.profiles.findByUsernameInsensitive(username);
    if (!profile) throw new NotFoundError("User not found.");

    const now = this.clock.now();
    const [subs, problemCounts, viewer] = await Promise.all([
      this.stats.submissionsFor(profile.userId),
      this.stats.countProblemsByDifficulty(),
      viewerId && viewerId !== profile.userId ? this.profiles.findByUserId(viewerId) : Promise.resolve(null),
    ]);
    const { acceptedSlugs, attempted, acceptanceRate } = summarise(subs);
    const solvedBy = countBy((await this.stats.difficultyBySlug([...acceptedSlugs])).values());
    const allMap = activityMapOf(subs.map((s) => s.createdAt));

    return {
      username: profile.username,
      bio: profile.bio,
      followers: profile.followers.length,
      following: profile.following.length,
      joinedAt: profile.createdAt.toISOString(),
      // UserProfile has no image; the newest submission's snapshot of the Clerk avatar.
      imageUrl: subs[0]?.userImageUrl ?? "",
      isOwnProfile: viewerId === profile.userId,
      isFollowing: viewer?.following.includes(profile.userId) ?? false,
      score: scoreOf(solvedBy),
      solved: { total: acceptedSlugs.size, byDifficulty: solvedBy },
      problemsByDifficulty: problemCounts,
      attempted,
      totalSubmissions: subs.length,
      acceptanceRate,
      streak: streakOf(allMap, now),
      activityData: last30Days(allMap, now),
      recentLog: subs.slice(0, 10).map(logEntry),
    };
  }

  /** Creates the caller's profile with a username derived from their email. Idempotent. */
  async setup(userId: string) {
    const existing = await this.profiles.findByUserId(userId);
    if (existing) return { message: "Profile already exists", profile: ownView(existing) };

    const user = await this.identity.getUser(userId);
    if (!user) throw new NotFoundError("User not found.");

    const email = user.primaryEmail ?? "";
    const base = email.split("@")[0] || `dw_${userId.slice(-6)}`;
    let username = base;
    let counter = 1;
    while (await this.profiles.usernameExists(username)) {
      username = `${base}${counter}`;
      counter++;
    }

    try {
      return { message: "Profile created", profile: ownView(await this.profiles.create(userId, username)) };
    } catch (err) {
      // A concurrent setup for the same user won the insert: return theirs.
      if (isDuplicateKey(err)) {
        const raced = await this.profiles.findByUserId(userId);
        if (raced) return { message: "Profile already exists", profile: ownView(raced) };
        throw new ConflictError("Username is already taken");
      }
      throw err;
    }
  }

  /** Change username (and bio). Format is validated at the boundary. */
  async updateIdentity(userId: string, username: string, bio: string | undefined) {
    const clash = await this.profiles.findByUsernameInsensitive(username);
    if (clash && clash.userId !== userId) throw new ConflictError("Username is already taken");
    try {
      return { message: "Profile updated", profile: ownView(await this.profiles.upsertIdentity(userId, username, bio)) };
    } catch (err) {
      // The unique index caught a race the check above could not.
      if (isDuplicateKey(err)) throw new ConflictError("Username is already taken");
      throw err;
    }
  }

  /** Toggle following `targetUsername`. */
  async toggleFollow(userId: string, targetUsername: string) {
    const target = await this.profiles.findByUsername(targetUsername);
    if (!target) throw new NotFoundError("User not found");
    if (target.userId === userId) throw new BadRequestError("Cannot follow yourself");
    const me = await this.profiles.findByUserId(userId);
    if (!me) throw new NotFoundError("Your profile not found");

    if (await this.profiles.unfollow(userId, target.userId)) {
      return { message: "Unfollowed successfully", following: false };
    }
    await this.profiles.follow(userId, target.userId);
    return { message: "Followed successfully", following: true };
  }
}

/** What the owner gets back after a write — no follower ids. */
function ownView(p: { username: string; bio: string; followers: string[]; following: string[] }) {
  return { username: p.username, bio: p.bio, followers: p.followers.length, following: p.following.length };
}

function logEntry(s: { problemSlug: string; status: string; executionTime: string; createdAt: Date }) {
  return { problemSlug: s.problemSlug, status: s.status, executionTime: s.executionTime, createdAt: s.createdAt };
}

function summarise(subs: { status: string; problemSlug: string }[]) {
  const acceptedSlugs = new Set(subs.filter((s) => s.status === "Accepted").map((s) => s.problemSlug));
  const attemptedSlugs = new Set(
    subs.filter((s) => s.status !== "Accepted" && !acceptedSlugs.has(s.problemSlug)).map((s) => s.problemSlug),
  );
  const acceptedCount = subs.filter((s) => s.status === "Accepted").length;
  const acceptanceRate = subs.length > 0 ? Math.round((acceptedCount / subs.length) * 100) : 0;
  return { acceptedSlugs, attempted: attemptedSlugs.size, acceptedCount, acceptanceRate };
}
