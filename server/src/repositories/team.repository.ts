/** Teams and countries. Delegates to data/repositories, where DATA_BACKEND picks the database. */
import * as profiles from "../data/repositories/profiles.ts";
import * as teams from "../data/repositories/teams.ts";

export type { NewTeam } from "../data/repositories/teams.ts";

export class TeamRepository {
  create(t: teams.NewTeam) {
    return teams.create(t);
  }
  bySlug(slug: string) {
    return teams.findBySlug(slug);
  }
  byInviteCode(code: string) {
    return teams.findByInviteCode(code);
  }
  forMember(userId: string) {
    return teams.findForMember(userId);
  }
  listed(limit: number) {
    return teams.listListed(limit);
  }
  memberships() {
    return teams.memberships();
  }
  addMember(slug: string, userId: string, max: number) {
    return teams.addMember(slug, userId, max);
  }
  removeMember(slug: string, userId: string) {
    return teams.removeMember(slug, userId);
  }
  setListed(slug: string, listed: boolean) {
    return teams.setListed(slug, listed);
  }
  remove(slug: string) {
    return teams.deleteBySlug(slug);
  }
  usernames(userIds: string[]) {
    return profiles.usernamesByUserId(userIds);
  }
  setCountry(userId: string, country: string | null) {
    return profiles.setCountry(userId, country);
  }
  countries() {
    return profiles.countriesByUserId();
  }
}
