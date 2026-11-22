/**
 * Domain module: practice modes — interview mode, code-size ranking, and AI
 * error explanations. Built from DomainDeps only.
 */
import { config } from "../config/index.ts";
import { PracticeController } from "../controllers/practice.controller.ts";
import { PracticeRepository } from "../repositories/practice.repository.ts";
import { ProblemCatalogRepository } from "../repositories/problemCatalog.repository.ts";
import { SubmissionRepository } from "../repositories/submission.repository.ts";
import { codeSizeRoutes, explainRoutes, interviewRoutes } from "../routes/v1/practice.routes.ts";
import { CodeSizeService } from "../services/practice/codeSize.service.ts";
import { ExplainService } from "../services/practice/explain.service.ts";
import { InterviewService } from "../services/practice/interview.service.ts";
import { GeminiProblemGenerator } from "../services/problem/problemGenerator.ts";
import type { DomainDeps, DomainModule } from "./types.ts";

export function buildPracticeDomain(deps: DomainDeps): DomainModule[] {
  const controller = new PracticeController(
    new InterviewService(deps.store, new ProblemCatalogRepository(), new SubmissionRepository(), deps.clock),
    new CodeSizeService(new PracticeRepository()),
    new ExplainService(deps.explainModel ?? new GeminiProblemGenerator(), config.gemini.apiKey),
  );
  const v = deps.tokenVerifier;
  return [
    { path: "/interview", router: interviewRoutes(controller, v) },
    { path: "/code-size", router: codeSizeRoutes(controller, v) },
    { path: "/explain", router: explainRoutes(controller, v) },
  ];
}
