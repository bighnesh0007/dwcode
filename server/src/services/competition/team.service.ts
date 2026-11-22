/**
 * Teams, countries, and the team and country leaderboards (SFCode parity,
 * Phase C). A user is in at most one team, enforced by the database (a unique
 * member index in Mongo, a unique user_id in Postgres), not only here.
 */
import { randomBytes } from "node:crypto";
import { TEAM_LIMITS, isCountryCode, teamSlugFor } from "@dwcode/shared";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../errors/AppError.ts";
import type { TeamRepository } from "../../repositories/team.repository.ts";
import type { UserStatsRepository } from "../../repositories/userStats.repository.ts";
import { countBy, scoreOf } from "../users/activity.ts";

type TeamDoc = NonNullable<Awaited<ReturnType<TeamRepository["bySlug"]>>>;

export interface TeamView {
  slug: string;
  name: string;
  listed: boolean;
  members: { userId: string; username: string | null; joinedAt: string }[];
  isOwner: boolean;
  isMember: boolean;
  /** Only the owner sees the invite code. */
  inviteCode?: string;
}

export interface GroupRow {
  rank: number;
  key: string;
  name: string;
  members: number;
  score: number;
}

const inviteCode = () => randomBytes(5).toString("hex").toUpperCase();

export class TeamService {
  constructor(
    private readonly teams: TeamRepository,
    private readonly stats: UserStatsRepository,
  ) {}

  private async view(team: TeamDoc, viewerId: string | undefined): Promise<TeamView> {
    const names = await this.teams.usernames(team.members.map((m) => m.userId));
    const isOwner = team.ownerId === viewerId;
    return {
      slug: team.slug,
      name: team.name,
      listed: team.listed,
      members: team.members.map((m) => ({ userId: m.userId, username: names.get(m.userId) ?? null, joinedAt: new Date(m.joinedAt).toISOString() })),
      isOwner,
      isMember: team.members.some((m) => m.userId === viewerId),
      ...(isOwner ? { inviteCode: team.inviteCode } : {}),
    };
  }

  async create(userId: string, name: string, listed: boolean): Promise<TeamView> {
    const clean = name.trim();
    if (clean.length < TEAM_LIMITS.nameMin || clean.length > TEAM_LIMITS.nameMax) {
      throw new BadRequestError(`Team names are ${TEAM_LIMITS.nameMin}–${TEAM_LIMITS.nameMax} characters.`);
    }
    const slug = teamSlugFor(clean);
    if (slug.length < TEAM_LIMITS.nameMin) throw new BadRequestError("Use letters or numbers in the team name.");
    if (await this.teams.forMember(userId)) throw new ConflictError("Leave your current team first.");
    const created = await this.teams.create({ slug, name: clean, ownerId: userId, inviteCode: inviteCode(), listed });
    if (created === "duplicate") throw new ConflictError("That team name is taken.");
    return this.view(created, userId);
  }

  async get(slug: string, viewerId: string | undefined): Promise<TeamView> {
    const team = await this.teams.bySlug(slug);
    if (!team) throw new NotFoundError("Team not found.");
    const isMember = team.members.some((m) => m.userId === viewerId);
    if (!team.listed && !isMember) throw new NotFoundError("Team not found.");
    return this.view(team, viewerId);
  }

  async mine(userId: string): Promise<TeamView | null> {
    const team = await this.teams.forMember(userId);
    return team ? this.view(team, userId) : null;
  }

  async directory(): Promise<{ slug: string; name: string; members: number }[]> {
    return (await this.teams.listed(100)).map((t) => ({ slug: t.slug, name: t.name, members: t.members.length }));
  }

  async join(userId: string, code: string): Promise<TeamView> {
    const team = await this.teams.byInviteCode(code.trim().toUpperCase());
    if (!team) throw new NotFoundError("No team has that invite code.");
    const outcome = await this.teams.addMember(team.slug, userId, TEAM_LIMITS.maxMembers);
    if (outcome === "full") throw new ConflictError("That team is full.");
    if (outcome === "taken") throw new ConflictError("You are already in a team. Leave it first.");
    if (outcome === "missing") throw new NotFoundError("Team not found.");
    const fresh = await this.teams.bySlug(team.slug);
    if (!fresh) throw new NotFoundError("Team not found.");
    return this.view(fresh, userId);
  }

  /** Leave; the team is deleted when its last member leaves. The owner cannot leave others behind. */
  async leave(userId: string, slug: string): Promise<{ left: true; deleted: boolean }> {
    const team = await this.teams.bySlug(slug);
    if (!team?.members.some((m) => m.userId === userId)) throw new NotFoundError("You are not in that team.");
    if (team.ownerId === userId && team.members.length > 1) {
      throw new BadRequestError("Remove the other members before the owner leaves.");
    }
    if (team.members.length === 1) {
      await this.teams.remove(slug);
      return { left: true, deleted: true };
    }
    await this.teams.removeMember(slug, userId);
    return { left: true, deleted: false };
  }

  async removeMember(ownerId: string, slug: string, memberId: string): Promise<TeamView> {
    const team = await this.teams.bySlug(slug);
    if (!team) throw new NotFoundError("Team not found.");
    if (team.ownerId !== ownerId) throw new ForbiddenError("Only the team owner can remove members.");
    if (memberId === ownerId) throw new BadRequestError("Leave the team instead.");
    await this.teams.removeMember(slug, memberId);
    const fresh = await this.teams.bySlug(slug);
    if (!fresh) throw new NotFoundError("Team not found.");
    return this.view(fresh, ownerId);
  }

  async setListed(ownerId: string, slug: string, listed: boolean): Promise<TeamView> {
    const team = await this.teams.bySlug(slug);
    if (!team) throw new NotFoundError("Team not found.");
    if (team.ownerId !== ownerId) throw new ForbiddenError("Only the team owner can change this.");
    await this.teams.setListed(slug, listed);
    return this.view({ ...team, listed }, ownerId);
  }

  async setCountry(userId: string, country: string | null): Promise<{ country: string | null }> {
    if (country !== null && !isCountryCode(country)) throw new BadRequestError("Unknown country.");
    await this.teams.setCountry(userId, country);
    return { country };
  }

  /** Per-user leaderboard scores, from the same aggregate and weights as the main board. */
  private async scores(): Promise<Map<string, number>> {
    const [perUser, difficulty] = await Promise.all([this.stats.aggregatePerUser([]), this.stats.difficultyBySlug()]);
    return new Map(perUser.map((u) => [u.userId, scoreOf(countBy(u.solvedSlugs.map((s) => difficulty.get(s))))]));
  }

  async teamLeaderboard(): Promise<GroupRow[]> {
    const [scores, memberships] = await Promise.all([this.scores(), this.teams.memberships()]);
    const groups = new Map<string, { name: string; members: number; score: number }>();
    for (const m of memberships) {
      const g = groups.get(m.slug) ?? { name: m.name, members: 0, score: 0 };
      g.members++;
      g.score += scores.get(m.userId) ?? 0;
      groups.set(m.slug, g);
    }
    return rank(groups);
  }

  async countryLeaderboard(): Promise<GroupRow[]> {
    const [scores, countries] = await Promise.all([this.scores(), this.teams.countries()]);
    const groups = new Map<string, { name: string; members: number; score: number }>();
    for (const [userId, code] of countries) {
      const g = groups.get(code) ?? { name: code, members: 0, score: 0 };
      g.members++;
      g.score += scores.get(userId) ?? 0;
      groups.set(code, g);
    }
    return rank(groups);
  }
}

function rank(groups: Map<string, { name: string; members: number; score: number }>): GroupRow[] {
  return [...groups.entries()]
    .sort(([ka, a], [kb, b]) => b.score - a.score || b.members - a.members || ka.localeCompare(kb))
    .map(([key, g], i) => ({ rank: i + 1, key, name: g.name, members: g.members, score: g.score }));
}
