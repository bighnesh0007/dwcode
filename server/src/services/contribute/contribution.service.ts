/**
 * Contributions (SFCode parity, Phase E): learners draft problems and
 * certification questions, or apply to become contributors; admins review.
 *
 * A problem draft carries case inputs only. The automatic check runs the
 * author's solution on every input through the compiler service and keeps
 * the outputs; those generated outputs — never anything typed by hand — are
 * what the published problem expects (CLAUDE.md). A check is bound to the
 * exact solution and inputs it ran, so editing either means checking again,
 * and approval re-runs it so the published outputs come from today's engine.
 */
import {
  CONTRIBUTION_REWARD,
  OPEN_LIMIT,
  draftFingerprint,
  formatCompilerOutput,
  type ContributionKind,
} from "@dwcode/shared";
import { BadRequestError, CompilerUnavailableError, ConflictError, ForbiddenError, NotFoundError } from "../../errors/AppError.ts";
import type { CoinsRepository } from "../../repositories/coins.repository.ts";
import type { ContributionDoc, ContributionRepository } from "../../repositories/contribution.repository.ts";
import type { NewProblem } from "../../repositories/problemCatalog.repository.ts";
import {
  applicationSchema,
  jobSchema,
  problemDraftSchema,
  questionDraftSchema,
  type ProblemDraft,
  type QuestionDraft,
} from "../../validation/contribution.schema.ts";
import { isInfrastructureFailure, type CompilerServiceClient } from "../compiler/compilerService.client.ts";
import type { CertQuestion } from "../learning/content.ts";
import type { Notifier } from "../notifications/notification.service.ts";
import type { ProblemService } from "../problem/problem.service.ts";

const OPEN = ["draft", "submitted"];
const EDITABLE = ["draft", "rejected"];
const MINE_LIMIT = 100;
const QUEUE_LIMIT = 100;

export interface CaseResult {
  input: string;
  hidden: boolean;
  output?: string;
  error?: string;
}

export interface DraftCheck {
  fingerprint: string;
  at: string;
  ok: boolean;
  cases: CaseResult[];
}

const SCHEMAS = { problem: problemDraftSchema, question: questionDraftSchema, application: applicationSchema, job: jobSchema } as const;

function parsePayload(kind: string, payload: unknown) {
  const schema = SCHEMAS[kind as ContributionKind];
  if (!schema) throw new BadRequestError("Unknown contribution kind.");
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid contribution.");
  return parsed.data;
}

export function view(doc: ContributionDoc) {
  return {
    id: String(doc._id),
    kind: doc.kind,
    authorId: doc.authorId,
    status: doc.status,
    payload: doc.payload,
    check: doc.check as DraftCheck | null,
    reviewNote: doc.reviewNote,
    publishedRef: doc.publishedRef,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** An approved question contribution, as it joins the certification bank. */
export function toCertQuestion(doc: ContributionDoc): CertQuestion | null {
  const parsed = questionDraftSchema.safeParse(doc.payload);
  if (!parsed.success) return null;
  return { id: `community-${String(doc._id)}`, ...parsed.data };
}

export class ContributionService {
  constructor(
    private readonly contributions: ContributionRepository,
    private readonly problems: ProblemService,
    private readonly coins: CoinsRepository,
    private readonly notifier: Notifier,
    private readonly compiler: CompilerServiceClient | undefined,
    private readonly now: () => Date,
  ) {}

  private async own(userId: string, id: string): Promise<ContributionDoc> {
    const doc = await this.contributions.findById(id);
    if (doc?.authorId !== userId) throw new NotFoundError("Contribution not found.");
    return doc;
  }

  async isContributor(userId: string): Promise<boolean> {
    return (await this.contributions.countByAuthor(userId, "application", ["approved"])) > 0;
  }

  async mine(userId: string) {
    const [docs, contributor] = await Promise.all([this.contributions.listByAuthor(userId, MINE_LIMIT), this.isContributor(userId)]);
    return { contributor, limit: contributor ? OPEN_LIMIT.contributor : OPEN_LIMIT.member, items: docs.map(view) };
  }

  async get(userId: string, id: string) {
    return view(await this.own(userId, id));
  }

  async create(userId: string, kind: ContributionKind, payload: unknown) {
    const data = parsePayload(kind, payload);
    if (kind === "application") {
      if (await this.isContributor(userId)) throw new ConflictError("You are already a contributor.");
      if ((await this.contributions.countByAuthor(userId, "application", OPEN)) > 0) {
        throw new ConflictError("You already have an application open.");
      }
    } else {
      const limit = (await this.isContributor(userId)) ? OPEN_LIMIT.contributor : OPEN_LIMIT.member;
      if ((await this.contributions.countByAuthor(userId, kind, OPEN)) >= limit) {
        throw new ConflictError(`You can have ${limit} open ${kind} contributions at a time.`);
      }
    }
    return view(await this.contributions.create({ kind, authorId: userId, status: "draft", payload: data }));
  }

  async update(userId: string, id: string, payload: unknown) {
    const doc = await this.own(userId, id);
    const data = parsePayload(doc.kind, payload);
    // Any edit drops the old check: it described other code or inputs.
    const updated = await this.contributions.transition(id, EDITABLE, { payload: data, check: null, status: "draft" });
    if (!updated) throw new ConflictError("Only drafts and rejected contributions can be edited.");
    return view(updated);
  }

  async remove(userId: string, id: string) {
    await this.own(userId, id);
    if (!(await this.contributions.removeDraft(id, userId))) throw new ConflictError("Only drafts can be deleted.");
    return { deleted: true };
  }

  /** Run the solution on every case input. Infrastructure failures throw; code errors are part of the result. */
  private async runDraft(draft: ProblemDraft): Promise<DraftCheck> {
    if (!this.compiler) throw new CompilerUnavailableError("The compiler service is not configured.", 60);
    const cases: CaseResult[] = [];
    for (const c of draft.cases) {
      const result = await this.compiler.execute({
        script: draft.solution,
        inputs: [{ name: "payload", value: c.input || "{}", mimeType: "application/json" }],
      });
      if (result.ok) cases.push({ ...c, output: formatCompilerOutput(result.output, draft.solution) });
      else if (isInfrastructureFailure(result)) throw new CompilerUnavailableError("The compiler is busy; try the check again shortly.", 10);
      else cases.push({ ...c, error: result.error.message.slice(0, 2000) });
    }
    const outputs = cases.map((c) => c.output);
    // Every input giving the same output means the cases test nothing.
    const distinct = new Set(outputs).size > 1;
    return {
      fingerprint: draftFingerprint(draft.solution, draft.cases),
      at: this.now().toISOString(),
      ok: cases.every((c) => c.output !== undefined) && distinct,
      cases,
    };
  }

  async check(userId: string, id: string) {
    const doc = await this.own(userId, id);
    if (doc.kind !== "problem") throw new BadRequestError("Only problem drafts are checked.");
    const check = await this.runDraft(parsePayload("problem", doc.payload) as ProblemDraft);
    const updated = await this.contributions.transition(id, EDITABLE, { check, status: "draft" });
    if (!updated) throw new ConflictError("Only drafts can be checked.");
    return view(updated);
  }

  async submit(userId: string, id: string) {
    const doc = await this.own(userId, id);
    if (doc.kind === "problem") {
      const draft = parsePayload("problem", doc.payload) as ProblemDraft;
      const check = doc.check as DraftCheck | null;
      if (!check?.ok || check.fingerprint !== draftFingerprint(draft.solution, draft.cases)) {
        throw new BadRequestError("Run the automatic check, and fix any failing case, before submitting.");
      }
    }
    const updated = await this.contributions.transition(id, EDITABLE, { status: "submitted" });
    if (!updated) throw new ConflictError("This contribution is already submitted or reviewed.");
    return view(updated);
  }

  async withdraw(userId: string, id: string) {
    await this.own(userId, id);
    const updated = await this.contributions.transition(id, ["submitted"], { status: "draft" });
    if (!updated) throw new ConflictError("Only submitted contributions can be withdrawn.");
    return view(updated);
  }

  // ── Review (admins; the route enforces it) ────────────────────────────────

  async queue(kind: ContributionKind | undefined) {
    return (await this.contributions.listByStatus("submitted", kind, QUEUE_LIMIT)).map(view);
  }

  async approve(adminId: string, id: string, note: string) {
    const doc = await this.contributions.findById(id);
    if (doc?.status !== "submitted") throw new NotFoundError("No submitted contribution with that id.");
    if (doc.authorId === adminId) throw new ForbiddenError("You cannot approve your own contribution.");

    let publishedRef = "";
    let link = "/contribute";
    if (doc.kind === "problem") {
      const draft = parsePayload("problem", doc.payload) as ProblemDraft;
      const check = await this.runDraft(draft);
      if (!check.ok) throw new BadRequestError("The solution no longer passes its automatic check; reject it with a note instead.");
      const problem = await this.problems.insert(publishable(draft, check, doc.authorId));
      publishedRef = problem.slug;
      link = `/problems/${publishedRef}`;
    } else if (doc.kind === "question") {
      publishedRef = `community-${String(doc._id)}`;
      link = "/certification";
    } else if (doc.kind === "job") {
      link = "/jobs";
    }

    const approved = await this.contributions.transition(id, ["submitted"], { status: "approved", reviewNote: note, reviewedBy: adminId, publishedRef });
    if (!approved) throw new ConflictError("Someone else reviewed this contribution first.");
    const reward = CONTRIBUTION_REWARD[doc.kind as ContributionKind];
    if (reward) await this.coins.award(doc.authorId, reward, "contribution_approved", `Contribution approved: ${titleOf(doc)}`);
    await this.notifier.notify(doc.authorId, {
      kind: "contribution",
      title: doc.kind === "application" ? "You're now a DWCode contributor" : `Your ${doc.kind} was approved${reward ? ` (+${reward} coins)` : ""}`,
      body: note || titleOf(doc),
      link,
    });
    return view(approved);
  }

  async reject(adminId: string, id: string, note: string) {
    if (!note) throw new BadRequestError("Say what needs to change, so the author can fix it.");
    const doc = await this.contributions.findById(id);
    if (!doc) throw new NotFoundError("Contribution not found.");
    const rejected = await this.contributions.transition(id, ["submitted"], { status: "rejected", reviewNote: note, reviewedBy: adminId });
    if (!rejected) throw new ConflictError("Only submitted contributions can be rejected.");
    await this.notifier.notify(doc.authorId, { kind: "contribution", title: `Changes requested on your ${doc.kind}`, body: note, link: `/contribute/${id}` });
    return view(rejected);
  }

  /** Approved job posts still inside their listing window, newest first. */
  async jobs(listingDays: number) {
    const since = this.now().getTime() - listingDays * 86_400_000;
    const docs = await this.contributions.listByStatus("approved", "job", 500);
    return docs
      .filter((d) => new Date(d.updatedAt).getTime() >= since)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((d) => ({ id: String(d._id), ...(d.payload as object), postedAt: d.updatedAt }));
  }

  /** Approved community questions, for the certification bank. */
  async approvedQuestions(): Promise<CertQuestion[]> {
    const docs = await this.contributions.listByStatus("approved", "question", 1000);
    return docs.map(toCertQuestion).filter((q): q is CertQuestion => q !== null);
  }
}

function titleOf(doc: ContributionDoc): string {
  const p = doc.payload as { title?: unknown; prompt?: unknown };
  const text = typeof p.title === "string" ? p.title : typeof p.prompt === "string" ? p.prompt : "contributor application";
  return text.slice(0, 120);
}

/** The problem as published: every expected output is the compiler's. */
export function publishable(draft: ProblemDraft, check: DraftCheck, authorId: string): NewProblem {
  const ran = check.cases.filter((c): c is CaseResult & { output: string } => c.output !== undefined);
  const visible = ran.filter((c) => !c.hidden).map((c) => ({ input: c.input, expectedOutput: c.output }));
  const hidden = ran.filter((c) => c.hidden).map((c) => ({ input: c.input, expectedOutput: c.output }));
  const first = visible[0];
  return {
    title: draft.title,
    slug: draft.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, ""),
    difficulty: draft.difficulty,
    category: draft.category,
    description: draft.description,
    tags: draft.tags,
    starterCode: draft.starterCode,
    solution: draft.solution,
    hints: draft.hints,
    testCases: visible,
    hiddenTestCases: hidden,
    ...(first ? { examples: [{ input: first.input, output: first.expectedOutput }] } : {}),
    createdByAI: false,
    createdBy: authorId,
  };
}

export type { QuestionDraft };
