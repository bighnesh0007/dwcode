/**
 * "Connect GitHub" OAuth flow. Ported from client/app/api/auth/github/*.
 *
 * Changes from the Next.js version, on purpose:
 *  - `state` is HMAC-signed and carries userId + expiry + returnTo, because the
 *    browser reaches us via the site's /backend proxy and the state cookie the old
 *    route relied on is gone. A state is single-use (nonce recorded in the store).
 *  - The access token is stored encrypted (see GitHubRepository.saveLink).
 *  - Every redirect is built from APP_URL plus a validated same-site path.
 */
import { NotConfiguredError } from "../../errors/AppError.ts";
import { OAUTH_STATE_TTL_MS, signOAuthState, verifyOAuthState } from "../../lib/crypto/oauthState.ts";
import type { GitHubRepository } from "../../repositories/github.repository.ts";
import type { Clock, FetchLike, KeyValueStore } from "../../types/ports.ts";
import { GITHUB_API } from "./githubApi.ts";

export interface GitHubOAuthOptions {
  clientId?: string;
  clientSecret?: string;
  stateSecret?: string;
  encryptionConfigured: boolean;
  /** Public site origin, e.g. https://dwl.bighnesh.space. */
  appUrl: string;
}

export const CALLBACK_PATH = "/backend/api/v1/github/callback";

export class GitHubOAuthService {
  constructor(
    private readonly repo: GitHubRepository,
    private readonly fetchImpl: FetchLike,
    private readonly store: KeyValueStore,
    private readonly clock: Clock,
    private readonly opts: GitHubOAuthOptions,
  ) {}

  private get appOrigin(): string {
    return this.opts.appUrl.replace(/\/+$/, "");
  }

  siteUrl(path: string): string {
    return `${this.appOrigin}${path}`;
  }

  callbackUrl(): string {
    return this.siteUrl(CALLBACK_PATH);
  }

  private configured(): { clientId: string; clientSecret: string; stateSecret: string } {
    const { clientId, clientSecret, stateSecret, encryptionConfigured } = this.opts;
    if (!clientId || !clientSecret || !stateSecret || !encryptionConfigured) throw new NotConfiguredError("GitHub integration");
    return { clientId, clientSecret, stateSecret };
  }

  /** The GitHub authorize URL to redirect the user to. */
  authorizeUrl(userId: string, returnTo: string | undefined): string {
    const { clientId, stateSecret } = this.configured();
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", this.callbackUrl());
    url.searchParams.set("scope", "repo");
    url.searchParams.set("state", signOAuthState({ userId, returnTo: returnTo ?? "" }, stateSecret, this.clock.nowMs()));
    return url.toString();
  }

  /**
   * Finish the flow. Always resolves to a same-site URL to redirect to — errors
   * become `/profile?error=<code>`, matching the old route's codes.
   */
  async complete(input: { code?: string; state?: string; error?: string; sessionUserId?: string }): Promise<string> {
    const fail = (code: string) => this.siteUrl(`/profile?error=${encodeURIComponent(code)}`);
    let secrets;
    try {
      secrets = this.configured();
    } catch {
      return fail("missing_github_credentials");
    }

    const state = input.state ? verifyOAuthState(input.state, secrets.stateSecret, this.clock.nowMs()) : null;
    if (!state) return fail("invalid_oauth_state");
    // If a session is present it must be the user who started the flow.
    if (input.sessionUserId && input.sessionUserId !== state.userId) return fail("invalid_oauth_state");
    if (input.error) return fail(input.error === "access_denied" ? "access_denied" : "github_oauth_error");
    if (!input.code) return fail("missing_code");
    // Single use: a replayed state (e.g. from a leaked URL) is refused.
    const fresh = await this.store.setIfAbsent(`gh-oauth-state:${state.nonce}`, 1, OAUTH_STATE_TTL_MS);
    if (!fresh) return fail("invalid_oauth_state");

    try {
      const tokenRes = await this.fetchImpl("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: secrets.clientId,
          client_secret: secrets.clientSecret,
          code: input.code,
          redirect_uri: this.callbackUrl(),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
      if (tokenData.error || !tokenData.access_token) return fail("github_token_exchange_failed");

      const userRes = await this.fetchImpl(`${GITHUB_API}/user`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(15_000),
      });
      const userData = (await userRes.json()) as { id?: number | string; login?: string };
      if (!userRes.ok || !userData.login || userData.id === undefined) return fail("github_user_fetch_failed");

      await this.repo.saveLink({
        userId: state.userId,
        githubId: String(userData.id),
        githubUsername: userData.login,
        accessToken: tokenData.access_token,
      });
    } catch {
      return fail("internal_error");
    }

    const destination = new URL(this.siteUrl(state.returnTo));
    destination.searchParams.set("github", "connected");
    return destination.toString();
  }
}
