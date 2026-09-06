import "server-only";

import nodemailer from "nodemailer";
import { EmailHttpError } from "@/lib/email-server";
import type { InvitationMessage } from "@/lib/invitation-message";

/**
 * Jarins' own outbound mailbox, used to send household invitations without
 * anyone connecting a personal one first.
 *
 * The connected-mailbox path already existed and still does — it sends the
 * invitation *from* a family member's own address, which is friendlier when the
 * recipient knows them. But it made sending conditional on a mailbox being
 * connected, so the default outcome of the invite form was a link to copy by
 * hand, which is not what "Invite by email" says it does.
 *
 * Two secrets, never NEXT_PUBLIC: a connection URL and a From address. They are
 * server-only and belong in `wrangler secret put` for production and
 * .env.local for development.
 */

const INVITE_URL = "INVITE_SMTP_URL";
const INVITE_FROM = "INVITE_FROM_ADDRESS";

export type HouseSender = {
  url: string;
  from: string;
};

/**
 * Returns null rather than throwing when the mailbox is not set up. The invite
 * form has to render, and still create a copyable link, on a deployment that
 * has no outbound mail at all.
 */
export function houseSender(): HouseSender | null {
  const url = process.env.INVITE_SMTP_URL?.trim();
  const from = process.env.INVITE_FROM_ADDRESS?.trim();
  if (!url || !from) return null;
  return { url, from };
}

/** What the invite form shows in its "Send from" list. Never the credentials. */
export function houseSenderAddress(): string | null {
  return houseSender()?.from ?? null;
}

export async function sendInvitationMail(
  sender: HouseSender,
  to: string,
  message: InvitationMessage,
) {
  const transport = nodemailer.createTransport(sender.url, {
    // Matches the connected-mailbox SMTP path: refuse an unverifiable
    // certificate rather than fall back to sending a household's private
    // invitation link over a connection anyone can sit in the middle of.
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  });
  try {
    await transport.sendMail({
      from: sender.from,
      to,
      subject: message.subject,
      text: message.text,
    });
  } catch (error) {
    // The provider's message names hosts, ports and sometimes the credential
    // that failed. It goes to the log, not to the browser.
    console.error(
      "[jarins] invitation mail failed",
      error instanceof Error ? error.message : error,
    );
    throw new EmailHttpError(
      502,
      `The invitation was created, but ${sender.from} could not send it. Copy the link below instead.`,
    );
  } finally {
    transport.close();
  }
}

/** Names the two secrets, so a misconfigured deployment says which are missing. */
export function houseSenderRequirement() {
  return `Set ${INVITE_URL} and ${INVITE_FROM} to send invitations from Jarins itself.`;
}
