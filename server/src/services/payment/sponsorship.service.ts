/**
 * Sponsorship business logic.
 *
 * THE SECURITY RULE: a payment is only ever marked `paid` after a signature computed
 * with the Razorpay key secret matches. The browser's "payment succeeded" callback is
 * treated as an untrusted hint — it tells us *which* order to check, nothing more.
 * Anyone can POST a fake success callback; nobody can forge an HMAC.
 *
 * Two independent confirmation paths exist, and both converge on the same guarded
 * transition:
 *   1. callback — the user's browser returns order_id + payment_id + signature
 *   2. webhook  — Razorpay calls us server-to-server, signed over the raw body
 * The webhook is authoritative (it still arrives if the user closes the tab).
 */
import { BadRequestError, ForbiddenError, NotConfiguredError, NotFoundError } from "../../errors/AppError.ts";
import { verifyHmacSha256 } from "../../lib/crypto/hmac.ts";
import { logEvent } from "../../lib/logger.ts";
import type { Clock } from "../../types/ports.ts";
import type { SponsorshipRepository, SponsorshipRecord } from "../../repositories/sponsorship.repository.ts";
import type { RazorpayClient } from "./razorpay.client.ts";

/** Preset tiers, in the smallest currency unit (paise). */
export const SPONSOR_TIERS = [
  { id: "coffee", label: "Buy a coffee", amount: 15_000 },
  { id: "supporter", label: "Supporter", amount: 50_000 },
  { id: "sponsor", label: "Sponsor", amount: 150_000 },
] as const;

export const MIN_AMOUNT = 10_000; // ₹100
export const MAX_AMOUNT = 10_000_000; // ₹100,000

export interface CreateOrderCommand {
  amount: number;
  sponsorName?: string;
  message?: string;
  showPublicly?: boolean;
  userId?: string;
}

export interface VerifyCallbackCommand {
  orderId: string;
  paymentId: string;
  signature: string;
}

export class SponsorshipService {
  constructor(
    private readonly razorpay: RazorpayClient,
    private readonly repo: SponsorshipRepository,
    private readonly credentials: { keySecret?: string; webhookSecret?: string; currency: string },
    private readonly clock: Clock,
  ) {}

  get isEnabled(): boolean {
    return this.razorpay.isConfigured;
  }

  /** Public config the sponsor page needs to open the Razorpay checkout. */
  getPublicConfig(): {
    enabled: boolean;
    keyId?: string;
    currency: string;
    tiers: typeof SPONSOR_TIERS;
    minAmount: number;
    maxAmount: number;
  } {
    return {
      enabled: this.isEnabled,
      ...(this.razorpay.publicKeyId ? { keyId: this.razorpay.publicKeyId } : {}),
      currency: this.credentials.currency,
      tiers: SPONSOR_TIERS,
      minAmount: MIN_AMOUNT,
      maxAmount: MAX_AMOUNT,
    };
  }

  async createOrder(command: CreateOrderCommand): Promise<{ orderId: string; amount: number; currency: string; keyId: string }> {
    if (!this.isEnabled) throw new NotConfiguredError("Sponsorship");

    // The amount is validated here as well as in the zod schema: the service must be
    // safe to call from anywhere, not only from behind that one route.
    if (!Number.isInteger(command.amount) || command.amount < MIN_AMOUNT || command.amount > MAX_AMOUNT) {
      throw new BadRequestError(
        `Amount must be a whole number between ${MIN_AMOUNT} and ${MAX_AMOUNT} (smallest currency unit).`,
      );
    }

    const receipt = `dwcode_${this.clock.nowMs().toString(36)}`;
    const order = await this.razorpay.createOrder({
      amount: command.amount,
      currency: this.credentials.currency,
      receipt,
      notes: {
        ...(command.userId ? { userId: command.userId } : {}),
        source: "dwcode-sponsor",
      },
    });

    await this.repo.create({
      orderId: order.id,
      amount: command.amount,
      currency: this.credentials.currency,
      status: "created",
      userId: command.userId ?? "",
      sponsorName: (command.sponsorName ?? "").slice(0, 80),
      message: (command.message ?? "").slice(0, 280),
      showPublicly: command.showPublicly ?? false,
    });

    logEvent("sponsorship.order_created", { orderId: order.id, amount: command.amount });

    return {
      orderId: order.id,
      amount: command.amount,
      currency: this.credentials.currency,
      keyId: this.razorpay.publicKeyId ?? "",
    };
  }

  /**
   * Verify the browser callback.
   *
   * Razorpay's documented signature for this path is:
   *   HMAC_SHA256(`${order_id}|${payment_id}`, key_secret)
   */
  async verifyCallback(command: VerifyCallbackCommand): Promise<{ status: SponsorshipRecord["status"] }> {
    const secret = this.credentials.keySecret;
    if (!secret) throw new NotConfiguredError("Sponsorship");

    const record = await this.repo.findByOrderId(command.orderId);
    if (!record) throw new NotFoundError("Unknown order.");

    const payload = `${command.orderId}|${command.paymentId}`;
    if (!verifyHmacSha256(payload, command.signature, secret)) {
      await this.repo.markFailed(command.orderId, "signature_mismatch");
      logEvent("sponsorship.signature_rejected", { orderId: command.orderId }, "warn");
      // Deliberately vague: do not help an attacker distinguish failure modes.
      throw new ForbiddenError("Payment could not be verified.");
    }

    const updated = await this.repo.markPaid(command.orderId, command.paymentId, "callback", this.clock.now());
    logEvent("sponsorship.paid", { orderId: command.orderId, via: "callback" });
    return { status: updated?.status ?? "paid" };
  }

  /**
   * Verify a webhook.
   *
   * The signature covers the RAW request body, so the route must hand us the exact
   * bytes Razorpay sent — any re-serialisation of parsed JSON will not match.
   */
  async handleWebhook(rawBody: string, signature: string): Promise<{ handled: boolean }> {
    const secret = this.credentials.webhookSecret;
    if (!secret) throw new NotConfiguredError("Sponsorship webhooks");

    if (!verifyHmacSha256(rawBody, signature, secret)) {
      logEvent("sponsorship.webhook_rejected", {}, "warn");
      throw new ForbiddenError("Invalid webhook signature.");
    }

    let event: unknown;
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new BadRequestError("Webhook body is not valid JSON.");
    }

    const parsed = this.extractPayment(event);
    if (!parsed) return { handled: false };

    if (parsed.eventName === "payment.captured" || parsed.eventName === "order.paid") {
      await this.repo.markPaid(parsed.orderId, parsed.paymentId, "webhook", this.clock.now());
      logEvent("sponsorship.paid", { orderId: parsed.orderId, via: "webhook" });
      return { handled: true };
    }

    if (parsed.eventName === "payment.failed") {
      await this.repo.markFailed(parsed.orderId, "payment_failed");
      logEvent("sponsorship.failed", { orderId: parsed.orderId }, "warn");
      return { handled: true };
    }

    return { handled: false };
  }

  /** Pull the bits we care about out of Razorpay's nested event envelope. */
  private extractPayment(
    event: unknown,
  ): { eventName: string; orderId: string; paymentId: string } | null {
    if (typeof event !== "object" || event === null) return null;
    const root = event as Record<string, unknown>;
    const eventName = typeof root.event === "string" ? root.event : "";
    if (!eventName) return null;

    const payload = root.payload;
    if (typeof payload !== "object" || payload === null) return null;

    const entity =
      (payload as Record<string, unknown>).payment ??
      (payload as Record<string, unknown>).order;
    if (typeof entity !== "object" || entity === null) return null;

    const inner = (entity as Record<string, unknown>).entity;
    if (typeof inner !== "object" || inner === null) return null;
    const record = inner as Record<string, unknown>;

    const orderId = typeof record.order_id === "string" ? record.order_id : typeof record.id === "string" ? record.id : "";
    const paymentId = typeof record.id === "string" ? record.id : "";
    if (!orderId) return null;

    return { eventName, orderId, paymentId };
  }

  /** Public sponsor wall: paid sponsorships that opted in to being shown. */
  async listPublicSponsors(limit: number): Promise<
    { sponsorName: string; message: string; amount: number; paidAt?: Date }[]
  > {
    const records = await this.repo.listPublicPaid(limit);
    return records.map((r) => ({
      sponsorName: r.sponsorName || "Anonymous",
      message: r.message,
      amount: r.amount,
      ...(r.paidAt ? { paidAt: r.paidAt } : {}),
    }));
  }
}
