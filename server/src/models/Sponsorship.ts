import mongoose from "mongoose";
import { modelFromSchema } from "./model.ts";

/**
 * A sponsorship (donation) attempt and its outcome.
 *
 * Sponsorships are deliberately allowed to be anonymous — `userId` is optional,
 * because requiring an account to donate loses donations.
 *
 * `status` transitions: created → paid | failed. Only the server moves a record to
 * `paid`, and only after verifying a Razorpay signature; the browser's success
 * callback is never trusted on its own.
 */
export const SponsorshipSchema = new mongoose.Schema({
  /** Razorpay order id — our idempotency key for the whole flow. */
  orderId: { type: String, required: true, unique: true },
  paymentId: { type: String, default: "" },
  /** Smallest currency unit (paise for INR), matching Razorpay's API. */
  amount: { type: Number, required: true, min: 100 },
  currency: { type: String, required: true, default: "INR" },
  status: {
    type: String,
    enum: ["created", "paid", "failed"],
    default: "created",
    index: true,
  },
  /** Clerk user id when the sponsor was signed in. */
  userId: { type: String, default: "" },
  sponsorName: { type: String, default: "" },
  message: { type: String, default: "", maxlength: 280 },
  /** Show this sponsor publicly? Opt-in. */
  showPublicly: { type: Boolean, default: false },
  /** Which path confirmed the payment — useful when reconciling. */
  verifiedVia: { type: String, enum: ["", "callback", "webhook"], default: "" },
  failureReason: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date },
});

SponsorshipSchema.index({ status: 1, createdAt: -1 });
SponsorshipSchema.index({ userId: 1, createdAt: -1 });

export const Sponsorship = modelFromSchema("Sponsorship", SponsorshipSchema);
