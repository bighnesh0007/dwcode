import { z } from "zod";
import { MAX_AMOUNT, MIN_AMOUNT } from "../services/payment/sponsorship.service.ts";

/**
 * `.strict()` everywhere: an unexpected key is a client bug (or an attempt to
 * smuggle a field), so it is rejected rather than silently dropped.
 */

export const createOrderSchema = z
  .object({
    /** Smallest currency unit (paise). Integer only — no floating-point money. */
    amount: z.number().int().min(MIN_AMOUNT).max(MAX_AMOUNT),
    sponsorName: z.string().trim().max(80).optional(),
    message: z.string().trim().max(280).optional(),
    showPublicly: z.boolean().optional(),
  })
  .strict();

export const verifyCallbackSchema = z
  .object({
    razorpay_order_id: z.string().min(1).max(100),
    razorpay_payment_id: z.string().min(1).max(100),
    razorpay_signature: z.string().min(1).max(200),
  })
  .strict();

export const publicSponsorsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type VerifyCallbackInput = z.infer<typeof verifyCallbackSchema>;
export type PublicSponsorsQuery = z.infer<typeof publicSponsorsQuerySchema>;
