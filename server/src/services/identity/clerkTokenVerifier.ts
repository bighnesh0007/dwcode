/**
 * Clerk JWT verification.
 *
 * Uses `@clerk/backend`'s `verifyToken` rather than `@clerk/express`: the frontend
 * sends `Authorization: Bearer <getToken()>`, which is a pure JWT check. The Express
 * middleware package's extra value is cookie/handshake handling for server-rendered
 * browser navigations, which this API never performs.
 */
import { verifyToken } from "@clerk/backend";
import { UnauthenticatedError } from "../../errors/AppError.ts";
import { ErrorCode } from "../../errors/codes.ts";
import type { TokenVerifier, VerifiedIdentity } from "../../types/ports.ts";

export class ClerkTokenVerifier implements TokenVerifier {
  constructor(
    private readonly secretKey: string,
    private readonly authorizedParties?: string[],
  ) {}

  async verify(token: string): Promise<VerifiedIdentity> {
    try {
      const claims = await verifyToken(token, {
        secretKey: this.secretKey,
        ...(this.authorizedParties?.length ? { authorizedParties: this.authorizedParties } : {}),
      });

      // `sub` is the Clerk user id. Without it the token is unusable.
      if (typeof claims.sub !== "string" || !claims.sub) {
        throw new UnauthenticatedError("Token has no subject.", ErrorCode.INVALID_TOKEN);
      }

      return {
        userId: claims.sub,
        ...(typeof claims.sid === "string" ? { sessionId: claims.sid } : {}),
        claims: claims as unknown as Record<string, unknown>,
      };
    } catch (err) {
      if (err instanceof UnauthenticatedError) throw err;
      // Expired, malformed, wrong issuer, bad signature — all the same to the caller.
      throw new UnauthenticatedError("Invalid or expired token.", ErrorCode.INVALID_TOKEN);
    }
  }
}

/** Used when Clerk is not configured: every verification fails closed. */
export class DisabledTokenVerifier implements TokenVerifier {
  verify(): Promise<VerifiedIdentity> {
    return Promise.reject(
      new UnauthenticatedError("Authentication is not configured on this server."),
    );
  }
}
