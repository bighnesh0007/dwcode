/**
 * Shapes shared with the backend's `/api/v1` surface.
 *
 * Kept hand-written for now rather than imported from `../../server/src/types` so the
 * two projects stay independently buildable and deployable. When the migration
 * finishes, these become a type-only import from the server's DTO module (see the
 * `@api/*` tsconfig path suggestion in the migration plan).
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    pagination?: { count: number; limit: number; total?: number; nextCursor?: string };
  };
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

// ─── Sponsorship ──────────────────────────────────────────────────────────────

export interface SponsorTier {
  id: string;
  label: string;
  /** Smallest currency unit (paise for INR). */
  amount: number;
}

export interface SponsorshipConfig {
  enabled: boolean;
  keyId?: string;
  currency: string;
  tiers: SponsorTier[];
  minAmount: number;
  maxAmount: number;
}

export interface CreatedOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface PublicSponsor {
  sponsorName: string;
  message: string;
  amount: number;
  paidAt?: string;
}
