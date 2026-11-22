/**
 * HTTP adapter for competition: standings, ratings, teams and countries.
 *
 *   GET  /api/v1/contests/:id/standings   public (private contests: members)
 *   GET  /api/v1/ratings                  public rating leaderboard
 *   GET  /api/v1/ratings/me               auth
 *   GET  /api/v1/ratings/u/:username      public
 *   GET  /api/v1/teams                    listed teams        POST /api/v1/teams       auth: create
 *   GET  /api/v1/teams/mine               auth                POST /api/v1/teams/join  auth: { code }
 *   GET  /api/v1/teams/:slug              listed or member
 *   POST /api/v1/teams/:slug/leave        auth   POST /api/v1/teams/:slug/remove  owner   POST /api/v1/teams/:slug/listed owner
 *   GET  /api/v1/leaderboards/teams       public GET /api/v1/leaderboards/countries public
 *   PUT  /api/v1/profile-country          auth   { country | null }
 */
import type { Request, Response } from "express";
import { NotFoundError, UnauthenticatedError } from "../errors/AppError.ts";
import { validatedBody, validatedParams } from "../middleware/validate.ts";
import type { UserProfileRepository } from "../repositories/userProfile.repository.ts";
import type { CompetitionService } from "../services/competition/competition.service.ts";
import type { TeamService } from "../services/competition/team.service.ts";
import { ok } from "../utils/respond.ts";
import type { CountryInput, CreateTeamInput, JoinTeamInput, ListedInput, RemoveMemberInput } from "../validation/competition.schema.ts";

function requireUser(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) throw new UnauthenticatedError("Authentication required.");
  return userId;
}

export class CompetitionController {
  constructor(
    private readonly competition: CompetitionService,
    private readonly teams: TeamService,
    private readonly profiles: UserProfileRepository,
  ) {}

  standings = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.competition.standings(validatedParams<{ id: string }>(req).id, req.auth?.userId));
  };

  ratings = async (_req: Request, res: Response): Promise<void> => {
    ok(res, { rows: await this.competition.ratingLeaderboard() });
  };

  myRating = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.competition.ratingFor(requireUser(req)));
  };

  userRating = async (req: Request, res: Response): Promise<void> => {
    const profile = await this.profiles.findByUsername(validatedParams<{ username: string }>(req).username);
    if (!profile) throw new NotFoundError("User not found");
    ok(res, await this.competition.ratingFor(profile.userId));
  };

  teamDirectory = async (_req: Request, res: Response): Promise<void> => {
    ok(res, { teams: await this.teams.directory() });
  };

  myTeam = async (req: Request, res: Response): Promise<void> => {
    ok(res, { team: await this.teams.mine(requireUser(req)) });
  };

  team = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.teams.get(validatedParams<{ slug: string }>(req).slug, req.auth?.userId));
  };

  createTeam = async (req: Request, res: Response): Promise<void> => {
    const body = validatedBody<CreateTeamInput>(req);
    ok(res, await this.teams.create(requireUser(req), body.name, body.listed));
  };

  joinTeam = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.teams.join(requireUser(req), validatedBody<JoinTeamInput>(req).code));
  };

  leaveTeam = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.teams.leave(requireUser(req), validatedParams<{ slug: string }>(req).slug));
  };

  removeMember = async (req: Request, res: Response): Promise<void> => {
    const { slug } = validatedParams<{ slug: string }>(req);
    ok(res, await this.teams.removeMember(requireUser(req), slug, validatedBody<RemoveMemberInput>(req).userId));
  };

  setListed = async (req: Request, res: Response): Promise<void> => {
    const { slug } = validatedParams<{ slug: string }>(req);
    ok(res, await this.teams.setListed(requireUser(req), slug, validatedBody<ListedInput>(req).listed));
  };

  teamLeaderboard = async (_req: Request, res: Response): Promise<void> => {
    ok(res, { rows: await this.teams.teamLeaderboard() });
  };

  countryLeaderboard = async (_req: Request, res: Response): Promise<void> => {
    ok(res, { rows: await this.teams.countryLeaderboard() });
  };

  setCountry = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.teams.setCountry(requireUser(req), validatedBody<CountryInput>(req).country));
  };
}
