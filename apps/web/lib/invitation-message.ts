/**
 * The invitation email itself, and the link inside it.
 *
 * Pure and server-independent so the wording and — more importantly — the URL
 * can be tested without a mail server. The link is the whole email: get the
 * path wrong and every invitation is a dead end that still looks like it sent.
 */

export type InvitationMessage = {
  subject: string;
  text: string;
};

/**
 * Invitations are accepted at /auth/invite/<token>.
 *
 * The old /invite/<token> path still works — the middleware 308s it — but a
 * mailed link outlives the redirect that rescues it, and a redirect is one more
 * thing between a person and the account they were invited to. Mail the
 * canonical path.
 */
export function invitationLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/auth/invite/${encodeURIComponent(token)}`;
}

/**
 * Plain text rather than HTML, deliberately. This mail carries a single
 * one-time link to a private household; a text part alone renders everywhere,
 * cannot hide its destination behind anchor text, and gives spam filters
 * nothing that looks like bulk marketing.
 */
export function invitationMessage({
  householdName,
  inviterName,
  link,
  role,
}: {
  householdName: string;
  inviterName: string;
  link: string;
  role: "adult" | "viewer";
}): InvitationMessage {
  const access =
    role === "adult"
      ? "You will be able to add and change things alongside the rest of the household."
      : "You will be able to read what the household shares, without changing it.";

  return {
    subject: `${inviterName} invited you to ${householdName} on Jarins`,
    text: [
      `${inviterName} has invited you to join ${householdName} on Jarins — a private space for a family's plans, documents and day-to-day life.`,
      "",
      access,
      "",
      "Open this invitation:",
      link,
      "",
      "The link works once, expires in seven days, and can only be accepted by this email address. If you were not expecting it, ignore this message and nothing happens.",
    ].join("\n"),
  };
}
