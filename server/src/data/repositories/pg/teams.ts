import { and, asc, count, desc, eq } from "drizzle-orm";
import { teamMembers, teams } from "../../postgres/schema.ts";
import type { NewTeam } from "../mongo/teams.ts";
import { isDuplicateKeyError } from "../shared.ts";
import { db, oid } from "./db.ts";

type TeamRow = typeof teams.$inferSelect;

async function withMembers(row: TeamRow | undefined) {
  if (!row) return null;
  const members = await db().select({ userId: teamMembers.userId, joinedAt: teamMembers.joinedAt })
    .from(teamMembers).where(eq(teamMembers.teamId, row.id)).orderBy(asc(teamMembers.joinedAt));
  const { id, ...rest } = row;
  return { _id: oid(id), ...rest, members };
}

/** `preset` carries Mongo's id and time when mirroring. */
export async function create(t: NewTeam, preset?: { id: string; createdAt: Date }) {
  try {
    const row = await db().transaction(async (tx) => {
      const [team] = await tx.insert(teams).values({ ...t, ...(preset && { id: preset.id, createdAt: preset.createdAt }) }).returning();
      if (!team) throw new Error("Team vanished after insert");
      await tx.insert(teamMembers).values({ teamId: team.id, userId: t.ownerId, ...(preset && { joinedAt: preset.createdAt }) });
      return team;
    });
    return (await withMembers(row)) ?? ("duplicate" as const);
  } catch (err) {
    if (isDuplicateKeyError(err)) return "duplicate" as const;
    throw err;
  }
}

async function one(where: ReturnType<typeof eq>) {
  const [row] = await db().select().from(teams).where(where).limit(1);
  return withMembers(row);
}

export const findBySlug = (slug: string) => one(eq(teams.slug, slug));
export const findByInviteCode = (inviteCode: string) => one(eq(teams.inviteCode, inviteCode));

export async function findForMember(userId: string) {
  const [m] = await db().select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId));
  return m ? one(eq(teams.id, m.teamId)) : null;
}

export async function listListed(limit: number) {
  const rows = await db().select().from(teams).where(eq(teams.listed, true)).orderBy(desc(teams.createdAt)).limit(limit);
  const teamsWithMembers = await Promise.all(rows.map((r) => withMembers(r)));
  return teamsWithMembers.filter((t): t is NonNullable<typeof t> => t !== null);
}

export async function memberships(): Promise<{ slug: string; name: string; userId: string }[]> {
  return db().select({ slug: teams.slug, name: teams.name, userId: teamMembers.userId })
    .from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId));
}

/** The count check and the insert share a transaction holding the team row lock. */
export async function addMember(slug: string, userId: string, max: number): Promise<"joined" | "full" | "taken" | "missing"> {
  try {
    return await db().transaction(async (tx) => {
      const [team] = await tx.select({ id: teams.id }).from(teams).where(eq(teams.slug, slug)).for("update");
      if (!team) return "missing" as const;
      const [row] = await tx.select({ n: count() }).from(teamMembers).where(eq(teamMembers.teamId, team.id));
      if ((row?.n ?? 0) >= max) return "full" as const;
      await tx.insert(teamMembers).values({ teamId: team.id, userId });
      return "joined" as const;
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) return "taken";
    throw err;
  }
}

export async function removeMember(slug: string, userId: string): Promise<void> {
  const [team] = await db().select({ id: teams.id }).from(teams).where(eq(teams.slug, slug));
  if (!team) return;
  await db().delete(teamMembers).where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, userId)));
}

export async function setListed(slug: string, listed: boolean): Promise<void> {
  await db().update(teams).set({ listed }).where(eq(teams.slug, slug));
}

export async function deleteBySlug(slug: string): Promise<void> {
  await db().delete(teams).where(eq(teams.slug, slug));
}
