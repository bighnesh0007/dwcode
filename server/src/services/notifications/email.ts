/**
 * Email notifications (SFCode parity, Phase F). After an in-app notification
 * is written, it is also emailed when the learner's preferences allow its
 * kind, they have an email address, and they are under the daily cap.
 * Configured once at startup; without a Resend key nothing is sent. Sending
 * never fails or delays the flow that produced the notification.
 */
import { EMAILS_PER_DAY, emailAllowed, utcDay, type EmailPrefs } from "@dwcode/shared";
import { logger } from "../../lib/logger.ts";
import * as details from "../../data/repositories/profileDetails.ts";
import type { FetchLike, IdentityProvider, KeyValueStore } from "../../types/ports.ts";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

/** Resend's HTTP API. */
export class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string, private readonly from: string, private readonly fetchImpl: FetchLike) {}

  async send(m: EmailMessage): Promise<void> {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}`);
  }
}

interface EmailSetup {
  mailer: Mailer;
  identity: IdentityProvider;
  store: KeyValueStore;
  appUrl: string;
}

let setup: EmailSetup | null = null;

/** Called once by the container. Pass null to turn email off (tests). */
export function configureEmail(s: EmailSetup | null): void {
  setup = s;
}

export function emailConfigured(): boolean {
  return setup !== null;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export function renderEmail(title: string, body: string, link: string, appUrl: string): Omit<EmailMessage, "to"> {
  const url = link ? `${appUrl}${link}` : appUrl;
  const settings = `${appUrl}/profile#email`;
  return {
    subject: title.slice(0, 150),
    text: `${title}\n\n${body}\n\n${url}\n\n—\nYou can change which emails you get at ${settings}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px">
<h2 style="font-size:18px">${escape(title)}</h2>
${body ? `<p style="white-space:pre-wrap">${escape(body)}</p>` : ""}
<p><a href="${escape(url)}">Open DWCode</a></p>
<hr><p style="font-size:12px;color:#666">You can change which emails you get in <a href="${escape(settings)}">your settings</a>.</p></div>`,
  };
}

/** Email one notification if this learner wants it. Never throws. */
export async function deliverEmail(userId: string, n: { kind: string; title: string; body?: string | undefined; link?: string | undefined }): Promise<"sent" | "skipped"> {
  const s = setup;
  if (!s) return "skipped";
  try {
    const row = await details.get(userId);
    const prefs = (row?.emailPrefs ?? {}) as EmailPrefs;
    if (!emailAllowed(n.kind, prefs)) return "skipped";
    const user = await s.identity.getUser(userId);
    if (!user?.primaryEmail) return "skipped";
    const count = await s.store.increment(`email:${userId}:${utcDay(new Date())}`, 86_400_000);
    if (count > EMAILS_PER_DAY) return "skipped";
    await s.mailer.send({ to: user.primaryEmail, ...renderEmail(n.title, n.body ?? "", n.link ?? "", s.appUrl) });
    return "sent";
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), kind: n.kind }, "[email] could not send");
    return "skipped";
  }
}

/** Admin email test: send a sample to an address now, bypassing preferences and the cap. */
export async function sendTestEmail(to: string): Promise<void> {
  if (!setup) throw new Error("Email is not configured (RESEND_API_KEY).");
  await setup.mailer.send({ to, ...renderEmail("DWCode email test", "If you can read this, email notifications work.", "/admin", setup.appUrl) });
}
