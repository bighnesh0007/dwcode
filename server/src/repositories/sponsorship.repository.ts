/**
 * Sponsorship persistence. Mongoose queries only — no business rules here.
 */
import { Sponsorship } from "../models/Sponsorship.ts";

export interface SponsorshipRecord {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: "created" | "paid" | "failed";
  userId: string;
  sponsorName: string;
  message: string;
  showPublicly: boolean;
  verifiedVia: "" | "callback" | "webhook";
  createdAt: Date;
  paidAt?: Date;
}

export class SponsorshipRepository {
  async create(input: {
    orderId: string;
    amount: number;
    currency: string;
    status: "created";
    userId: string;
    sponsorName: string;
    message: string;
    showPublicly: boolean;
  }): Promise<void> {
    await Sponsorship.create(input);
  }

  async findByOrderId(orderId: string): Promise<SponsorshipRecord | null> {
    return (await Sponsorship.findOne({ orderId }).lean()) as SponsorshipRecord | null;
  }

  /**
   * Idempotent transition to `paid`.
   *
   * The `status: { $ne: "paid" }` guard means the callback and the webhook can both
   * arrive — in either order, or twice — without double-processing. Whichever lands
   * first wins and records how it was verified.
   */
  async markPaid(
    orderId: string,
    paymentId: string,
    via: "callback" | "webhook",
    at: Date,
  ): Promise<SponsorshipRecord | null> {
    return (await Sponsorship.findOneAndUpdate(
      { orderId, status: { $ne: "paid" } },
      { $set: { status: "paid", paymentId, verifiedVia: via, paidAt: at } },
      { new: true },
    ).lean()) as SponsorshipRecord | null;
  }

  /** Never downgrade an already-paid record. */
  async markFailed(orderId: string, reason: string): Promise<void> {
    await Sponsorship.updateOne(
      { orderId, status: { $ne: "paid" } },
      { $set: { status: "failed", failureReason: reason } },
    );
  }

  async listPublicPaid(limit: number): Promise<SponsorshipRecord[]> {
    return (await Sponsorship.find({ status: "paid", showPublicly: true })
      .sort({ paidAt: -1 })
      .limit(limit)
      .lean()) as SponsorshipRecord[];
  }
}
