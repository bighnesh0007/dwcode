/**
 * Profile extras, the activity feed and mentors (SFCode parity, Phase E).
 *
 *  - About: a headline, an about section and links, beside the existing bio.
 *  - Cosmetics: equip an owned (or free) item into its slot.
 *  - Skill radar: solved problems per category against the catalogue.
 *  - Feed: recent solves and blog posts by the people you follow.
 *  - Mentors: opt in with topics; others can ask, a few times a day.
 */
import { hiddenRefs } from "../admin/hiddenContent.ts";
import {
  MENTOR_ASKS_PER_DAY,
  equippedItems,
  findCosmetic,
  utcDay,
  type CosmeticSlot,
  type Equipped,
} from "@dwcode/shared";
import { BadRequestError, ForbiddenError, NotFoundError, RateLimitError } from "../../errors/AppError.ts";
import type { BlogRepository } from "../../repositories/blog.repository.ts";
import type { ProblemCatalogRepository } from "../../repositories/problemCatalog.repository.ts";
import type { ProfileDetailRepository } from "../../repositories/profileDetail.repository.ts";
import type { StorePurchaseRepository } from "../../repositories/storePurchase.repository.ts";
import type { SubmissionRepository } from "../../repositories/submission.repository.ts";
import type { UserProfileRepository } from "../../repositories/userProfile.repository.ts";
import type { Clock, KeyValueStore } from "../../types/ports.ts";
import type { Notifier } from "../notifications/notification.service.ts";

const FEED_SOLVES = 60;
const FEED_POSTS = 20;
const FEED_LIMIT = 50;
const MENTOR_LIMIT = 100;
const DAY_MS = 86_400_000;

export interface AboutInput {
  headline: string;
  about: string;
  links: Record<string, string>;
}

export interface MentorInput {
  active: boolean;
  topics: string[];
  note: string;
}

interface Detail {
  headline: string;
  about: string;
  links: Record<string, string>;
  equipped: Record<string, string>;
  mentorActive: boolean;
  mentorTopics: string[];
  mentorNote: string;
}

function detailOf(row: Partial<Detail> | null | undefined): Detail {
  return {
    headline: row?.headline ?? "",
    about: row?.about ?? "",
    links: row?.links ?? {},
    equipped: row?.equipped ?? {},
    mentorActive: row?.mentorActive ?? false,
    mentorTopics: row?.mentorTopics ?? [],
    mentorNote: row?.mentorNote ?? "",
  };
}

export class ProfileExtrasService {
  constructor(
    private readonly details: ProfileDetailRepository,
    private readonly profiles: UserProfileRepository,
    private readonly purchases: StorePurchaseRepository,
    private readonly catalog: ProblemCatalogRepository,
    private readonly submissions: SubmissionRepository,
    private readonly blog: BlogRepository,
    private readonly notifier: Notifier,
    private readonly store: KeyValueStore,
    private readonly clock: Clock,
  ) {}

  async mine(userId: string) {
    const [row, owned] = await Promise.all([this.details.get(userId), this.purchases.ownedItemIds(userId)]);
    const d = detailOf(row);
    return { ...d, equippedItems: equippedItems(d.equipped), owned };
  }

  async updateAbout(userId: string, input: AboutInput) {
    return detailOf(await this.details.upsert(userId, { headline: input.headline, about: input.about, links: input.links }));
  }

  async equip(userId: string, slot: CosmeticSlot, itemId: string) {
    const item = findCosmetic(itemId);
    if (item?.slot !== slot) throw new NotFoundError("No such item for that slot.");
    if (item.cost > 0 && !(await this.purchases.owns(userId, item.id))) throw new ForbiddenError("Buy this item in the store first.");
    const current = detailOf(await this.details.get(userId)).equipped;
    const saved = await this.details.upsert(userId, { equipped: { ...current, [slot]: item.id } });
    const equipped = detailOf(saved).equipped as Equipped;
    return { equipped, equippedItems: equippedItems(equipped) };
  }

  async setMentor(userId: string, input: MentorInput) {
    if (input.active && input.topics.length === 0) throw new BadRequestError("Add at least one topic you can help with.");
    if (!(await this.profiles.findByUserId(userId))) throw new BadRequestError("Set up your profile first.");
    return detailOf(await this.details.upsert(userId, { mentorActive: input.active, mentorTopics: input.topics, mentorNote: input.note }));
  }

  /** Solved problems per category, against how many the catalogue has. */
  private async skills(userId: string) {
    const [rows, solved] = await Promise.all([this.catalog.list({}), this.submissions.acceptedSlugs(userId)]);
    const done = new Set(solved);
    const byCategory = new Map<string, { solved: number; total: number }>();
    for (const p of rows as unknown as { slug?: string; category?: string }[]) {
      if (!p.slug || !p.category) continue;
      const cell = byCategory.get(p.category) ?? { solved: 0, total: 0 };
      cell.total++;
      if (done.has(p.slug)) cell.solved++;
      byCategory.set(p.category, cell);
    }
    return [...byCategory.entries()].map(([category, c]) => ({ category, ...c })).sort((a, b) => b.total - a.total);
  }

  async publicView(username: string) {
    const profile = await this.profiles.findByUsername(username);
    if (!profile) throw new NotFoundError("User not found.");
    const [row, skills] = await Promise.all([this.details.get(profile.userId), this.skills(profile.userId)]);
    const d = detailOf(row);
    return {
      username: profile.username,
      headline: d.headline,
      about: d.about,
      links: d.links,
      equipped: equippedItems(d.equipped),
      mentor: d.mentorActive ? { topics: d.mentorTopics, note: d.mentorNote } : null,
      skills,
    };
  }

  /** Recent solves and blog posts by the people this user follows, newest first. */
  async feed(userId: string) {
    const me = await this.profiles.findByUserId(userId);
    const following = me?.following ?? [];
    if (following.length === 0) return { following: 0, items: [] };
    const followed = new Set(following);
    const [solves, posts, catalog, names, hiddenPosts] = await Promise.all([
      this.details.acceptedByUsers(following, FEED_SOLVES),
      this.blog.listPublished(),
      this.catalog.list({}),
      this.profiles.usernamesFor(following),
      hiddenRefs("blog"),
    ]);
    const titles = new Map((catalog as unknown as { slug?: string; title?: string; difficulty?: string }[])
      .flatMap((p) => (p.slug ? [[p.slug, { title: p.title ?? p.slug, difficulty: p.difficulty ?? "" }] as const] : [])));
    // One entry per user and problem: the first solve is the news.
    const seen = new Set<string>();
    const items: { type: "solve" | "post"; at: string; username: string; title: string; link: string; difficulty?: string }[] = [];
    for (const s of [...solves].reverse()) {
      const key = `${s.userId}:${s.problemSlug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const p = titles.get(s.problemSlug);
      items.push({
        type: "solve", at: new Date(s.createdAt).toISOString(), username: names.get(s.userId) ?? "someone",
        title: p?.title ?? s.problemSlug, link: `/problems/${s.problemSlug}`, ...(p?.difficulty ? { difficulty: p.difficulty } : {}),
      });
    }
    for (const post of (posts as unknown as { authorId: string; title: string; slug: string; createdAt: Date }[])
      .filter((b) => followed.has(b.authorId) && !hiddenPosts.has(b.slug)).slice(0, FEED_POSTS)) {
      items.push({ type: "post", at: new Date(post.createdAt).toISOString(), username: names.get(post.authorId) ?? "someone", title: post.title, link: `/blog/${post.slug}` });
    }
    items.sort((a, b) => b.at.localeCompare(a.at));
    return { following: following.length, items: items.slice(0, FEED_LIMIT) };
  }

  async mentors() {
    const rows = await this.details.listMentors(MENTOR_LIMIT);
    const names = await this.profiles.usernamesFor(rows.map((r) => r.userId));
    return rows
      .filter((r) => names.has(r.userId))
      .map((r) => ({ username: names.get(r.userId) ?? "", headline: r.headline, topics: r.mentorTopics, note: r.mentorNote }));
  }

  async ask(userId: string, mentorUsername: string, message: string) {
    const mentor = await this.profiles.findByUsername(mentorUsername);
    if (!mentor || !detailOf(await this.details.get(mentor.userId)).mentorActive) throw new NotFoundError("That person isn't mentoring right now.");
    if (mentor.userId === userId) throw new BadRequestError("You can't ask yourself.");
    const me = await this.profiles.findByUserId(userId);
    if (!me) throw new BadRequestError("Set up your profile first, so the mentor can reach you.");
    const asks = await this.store.increment(`mentor-ask:${userId}:${utcDay(new Date(this.clock.nowMs()))}`, DAY_MS);
    if (asks > MENTOR_ASKS_PER_DAY) throw new RateLimitError(`You can send ${MENTOR_ASKS_PER_DAY} mentoring requests a day.`);
    await this.notifier.notify(mentor.userId, {
      kind: "mentor",
      title: `${me.username} asked you for mentoring`,
      body: message,
      link: `/profile/${encodeURIComponent(me.username)}`,
    });
    return { sent: true };
  }
}
