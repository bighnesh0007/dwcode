/**
 * Display identity from Clerk. Previously the Next.js route read
 * `currentUser()`; the backend resolves it itself so it can never come from a
 * request body.
 */
import { createClerkClient } from "@clerk/backend";
import type { IdentityProvider, UserIdentity } from "../../types/ports.ts";

export class ClerkIdentityProvider implements IdentityProvider {
  private readonly clerk;

  constructor(secretKey: string) {
    this.clerk = createClerkClient({ secretKey });
  }

  async getUser(userId: string): Promise<UserIdentity | null> {
    try {
      const u = await this.clerk.users.getUser(userId);
      return {
        userId: u.id,
        // Same precedence the Next.js route used: full name, then username.
        displayName: u.fullName || u.username || "Anonymous",
        imageUrl: u.imageUrl || "",
        ...(u.primaryEmailAddress?.emailAddress ? { primaryEmail: u.primaryEmailAddress.emailAddress } : {}),
      };
    } catch {
      return null;
    }
  }
}

/** When Clerk is not configured: submissions still record, as "Anonymous". */
export class NullIdentityProvider implements IdentityProvider {
  getUser(): Promise<UserIdentity | null> {
    return Promise.resolve(null);
  }
}
