/**
 * Domain module: admin, the GitHub link, and playground sharing.
 * Owns /api/v1/admin, /api/v1/github and /api/v1/playground; built from DomainDeps only.
 */
import { config } from "../config/index.ts";
import { AdminController } from "../controllers/admin.controller.ts";
import { GitHubController } from "../controllers/github.controller.ts";
import { PlaygroundController } from "../controllers/playground.controller.ts";
import { AdminRepository } from "../repositories/admin.repository.ts";
import { GitHubRepository } from "../repositories/github.repository.ts";
import { PlaygroundRepository } from "../repositories/playground.repository.ts";
import { adminRoutes } from "../routes/v1/admin.routes.ts";
import { githubRoutes } from "../routes/v1/github.routes.ts";
import { playgroundRoutes } from "../routes/v1/playground.routes.ts";
import { AdminService } from "../services/admin/admin.service.ts";
import { GitHubOAuthService } from "../services/github/githubOAuth.service.ts";
import { PlaygroundGitHubService } from "../services/github/playgroundGitHub.service.ts";
import { PlaygroundShareService } from "../services/playground/share.service.ts";
import type { DomainDeps, DomainModule } from "./types.ts";

export function buildAdminDomain(deps: DomainDeps): DomainModule[] {
  const github = new GitHubRepository(config.secrets.tokenEncryptionKey);

  const admin = new AdminController(new AdminService(new AdminRepository(), deps.clock, config.superAdminUserId ?? ""));

  const oauth = new GitHubOAuthService(github, deps.fetchImpl, deps.store, deps.clock, {
    ...(config.github.clientId ? { clientId: config.github.clientId } : {}),
    ...(config.github.clientSecret ? { clientSecret: config.github.clientSecret } : {}),
    ...(config.secrets.oauthStateSecret ? { stateSecret: config.secrets.oauthStateSecret } : {}),
    encryptionConfigured: Boolean(config.secrets.tokenEncryptionKey),
    appUrl: config.http.appUrl,
  });

  const playground = new PlaygroundController(
    new PlaygroundShareService(new PlaygroundRepository()),
    new PlaygroundGitHubService(github, deps.fetchImpl, deps.clock),
  );

  return [
    { path: "/admin", router: adminRoutes(admin, deps.tokenVerifier) },
    { path: "/github", router: githubRoutes(new GitHubController(oauth, github), deps.tokenVerifier) },
    { path: "/playground", router: playgroundRoutes(playground, deps.tokenVerifier) },
  ];
}
