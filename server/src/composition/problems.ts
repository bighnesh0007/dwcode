/**
 * Domain module: problems — the problem bank, problem reports and AI
 * generation. Built from DomainDeps only.
 */
import { config } from "../config/index.ts";
import {
  ProblemController,
  ProblemGenerationController,
  ProblemReportController,
} from "../controllers/problem.controller.ts";
import { CoinsRepository } from "../repositories/coins.repository.ts";
import { ProblemAccessRepository } from "../repositories/problemAccess.repository.ts";
import { ProblemCatalogRepository } from "../repositories/problemCatalog.repository.ts";
import { ProblemReportRepository } from "../repositories/problemReport.repository.ts";
import { problemGenerationRoutes, problemReportRoutes, problemRoutes } from "../routes/v1/problem.routes.ts";
import { ProblemService } from "../services/problem/problem.service.ts";
import { ProblemGenerationService } from "../services/problem/problemGeneration.service.ts";
import { GeminiProblemGenerator } from "../services/problem/problemGenerator.ts";
import { ProblemReportService } from "../services/problem/problemReport.service.ts";
import type { DomainDeps, DomainModule } from "./types.ts";

export function buildProblemsDomain(deps: DomainDeps): DomainModule[] {
  const catalog = new ProblemCatalogRepository();
  const coins = new CoinsRepository();
  const problems = new ProblemService(catalog, new ProblemAccessRepository(), coins);
  const reports = new ProblemReportService(new ProblemReportRepository(), catalog, deps.identity);
  const generation = new ProblemGenerationService(new GeminiProblemGenerator(), problems, coins, config.gemini.apiKey);

  return [
    { path: "/problems", router: problemRoutes(new ProblemController(problems), deps.tokenVerifier) },
    { path: "/problem-reports", router: problemReportRoutes(new ProblemReportController(reports), deps.tokenVerifier) },
    { path: "/generate", router: problemGenerationRoutes(new ProblemGenerationController(generation), deps.tokenVerifier) },
  ];
}
