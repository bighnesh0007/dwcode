/**
 * HTTP adapter for sponsorship. Reads `req.validated`, calls the service, sends the
 * envelope. No business rules, no signature maths — those live in the service.
 */
import type { Request, Response } from "express";
import { BadRequestError } from "../errors/AppError.ts";
import { validatedBody, validatedQuery } from "../middleware/validate.ts";
import { ok, created } from "../utils/respond.ts";
import type { SponsorshipService } from "../services/payment/sponsorship.service.ts";
import type {
  CreateOrderInput,
  PublicSponsorsQuery,
  VerifyCallbackInput,
} from "../validation/sponsorship.schema.ts";

export class SponsorshipController {
  constructor(private readonly service: SponsorshipService) {}

  /** GET /api/v1/sponsorship/config — what the sponsor page needs to render. */
  getConfig = (_req: Request, res: Response): void => {
    ok(res, this.service.getPublicConfig());
  };

  /** POST /api/v1/sponsorship/orders — auth optional; anonymous donations allowed. */
  createOrder = async (req: Request, res: Response): Promise<void> => {
    const body = validatedBody<CreateOrderInput>(req);
    const result = await this.service.createOrder({
      amount: body.amount,
      ...(body.sponsorName === undefined ? {} : { sponsorName: body.sponsorName }),
      ...(body.message === undefined ? {} : { message: body.message }),
      ...(body.showPublicly === undefined ? {} : { showPublicly: body.showPublicly }),
      // Identity comes from the verified token, never from the request body.
      ...(req.auth?.userId ? { userId: req.auth.userId } : {}),
    });
    created(res, result);
  };

  /** POST /api/v1/sponsorship/verify — confirms the browser callback. */
  verify = async (req: Request, res: Response): Promise<void> => {
    const body = validatedBody<VerifyCallbackInput>(req);
    const result = await this.service.verifyCallback({
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    });
    ok(res, result);
  };

  /**
   * POST /api/v1/sponsorship/webhook
   *
   * Mounted with `express.raw()`, so `req.body` is a Buffer. The signature is computed
   * over those exact bytes — re-serialising parsed JSON would produce a different
   * payload and always fail.
   */
  webhook = async (req: Request, res: Response): Promise<void> => {
    const signature = req.get("x-razorpay-signature") ?? "";
    if (!signature) throw new BadRequestError("Missing signature header.");
    if (!Buffer.isBuffer(req.body)) {
      throw new BadRequestError("Expected a raw request body.");
    }

    const result = await this.service.handleWebhook(req.body.toString("utf8"), signature);
    // Always 200 once verified: a non-2xx makes Razorpay retry, and an event we
    // simply do not care about is not an error worth retrying.
    ok(res, result);
  };

  /** GET /api/v1/sponsorship/sponsors — the public sponsor wall. */
  listSponsors = async (req: Request, res: Response): Promise<void> => {
    const query = validatedQuery<PublicSponsorsQuery>(req);
    const sponsors = await this.service.listPublicSponsors(query.limit);
    ok(res, { sponsors }, { pagination: { count: sponsors.length, limit: query.limit } });
  };
}
