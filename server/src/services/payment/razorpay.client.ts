/**
 * Minimal Razorpay client.
 *
 * Uses the REST API with HTTP Basic auth rather than the `razorpay` npm SDK: the two
 * calls we need are trivial, and this keeps `fetch` injectable so the whole payment
 * flow is testable without network access or a real merchant account.
 *
 * Amounts are ALWAYS in the smallest currency unit (paise for INR) — that is
 * Razorpay's contract, and mixing rupees with paise is the classic 100x bug here.
 */
import { NotConfiguredError, UpstreamError } from "../../errors/AppError.ts";
import { contextLogger } from "../../lib/logger.ts";
import type { FetchLike } from "../../types/ports.ts";

const RAZORPAY_API = "https://api.razorpay.com/v1";

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
}

export class RazorpayClient {
  constructor(
    private readonly credentials: RazorpayCredentials | undefined,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.credentials?.keyId && this.credentials?.keySecret);
  }

  /** The publishable key id, safe to send to the browser. */
  get publicKeyId(): string | undefined {
    return this.credentials?.keyId;
  }

  private authHeader(): string {
    if (!this.credentials) throw new NotConfiguredError("Razorpay");
    const raw = `${this.credentials.keyId}:${this.credentials.keySecret}`;
    return `Basic ${Buffer.from(raw).toString("base64")}`;
  }

  async createOrder(input: {
    amount: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayOrder> {
    if (!this.isConfigured) throw new NotConfiguredError("Razorpay");

    let response: Response;
    try {
      response = await this.fetchImpl(`${RAZORPAY_API}/orders`, {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: input.amount,
          currency: input.currency,
          receipt: input.receipt,
          // Razorpay rejects notes values that are not strings.
          ...(input.notes ? { notes: input.notes } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new UpstreamError(
        timedOut ? "Razorpay did not respond in time." : "Could not reach Razorpay.",
        { timeout: timedOut, cause: err },
      );
    }

    if (!response.ok) {
      // Razorpay error bodies contain a description but can also carry merchant
      // details, so the text is logged and never returned to the caller verbatim.
      const detail = await response.text().catch(() => "");
      contextLogger().error(
        { status: response.status, detail: detail.slice(0, 500) },
        "razorpay order creation failed",
      );
      throw new UpstreamError("Could not create the payment order.", { expose: true });
    }

    return (await response.json()) as RazorpayOrder;
  }
}
