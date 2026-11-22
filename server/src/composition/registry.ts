/** Every migrated domain, mounted by routes/v1/index.ts. */
import { buildAdminDomain } from "./admin.ts";
import { buildCommunityDomain } from "./community.ts";
import { buildCompetitionDomain } from "./competition.ts";
import { buildContestsDomain } from "./contests.ts";
import { buildEngagementDomain } from "./engagement.ts";
import { buildNotificationsDomain } from "./notifications.ts";
import { buildPracticeDomain } from "./practice.ts";
import { buildProblemsDomain } from "./problems.ts";
import type { DomainDeps, DomainModule } from "./types.ts";
import { buildUsersDomain } from "./users.ts";

export function buildDomains(deps: DomainDeps): DomainModule[] {
  return [
    ...buildProblemsDomain(deps),
    ...buildCommunityDomain(deps),
    ...buildUsersDomain(deps),
    ...buildContestsDomain(deps),
    ...buildCompetitionDomain(deps),
    ...buildAdminDomain(deps),
    ...buildEngagementDomain(deps),
    ...buildNotificationsDomain(deps),
    ...buildPracticeDomain(deps),
  ];
}
