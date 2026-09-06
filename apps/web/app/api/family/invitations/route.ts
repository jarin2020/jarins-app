import { z } from "zod";
import {
  assertSameOrigin,
  EmailHttpError,
  errorResponse,
  requireEmailUser,
} from "@/lib/email-server";
import {
  houseSender,
  houseSenderAddress,
  sendInvitationMail,
} from "@/lib/invitation-mail";
import { invitationLink, invitationMessage } from "@/lib/invitation-message";

/**
 * Create a household invitation and mail it, in one request.
 *
 * The client used to do this in two steps: call the RPC, get a link back, then
 * hand that link to the mail endpoint. That made the browser the author of the
 * URL Jarins puts in an email — a signed-in owner could post any address they
 * liked and have it delivered over the household's sender. Here the token never
 * leaves the server between minting and sending, so the only thing that can be
 * mailed is a link this route just created.
 *
 * The RPC runs under the caller's session, so its owner-only check still
 * decides who may invite; this route adds no authority of its own.
 */

const bodySchema = z.object({
  email: z.email().max(320),
  role: z.enum(["adult", "viewer"]),
});

/** Tells the invite form whether "Send from Jarins" is a real option. */
export async function GET() {
  try {
    await requireEmailUser();
    return Response.json({ address: houseSenderAddress() });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * A household owner inviting their own family is inherently low-volume, but
 * this is an outbound mail path reachable from a browser, so it gets a ceiling.
 * Counted from the invitations themselves rather than a new table: the RPC
 * writes one row per invitation and owners can already read their own.
 */
const HOURLY_INVITE_LIMIT = 20;

async function assertUnderInviteLimit(
  supabase: Awaited<ReturnType<typeof requireEmailUser>>["supabase"],
  userId: string,
) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("household_invitations")
    .select("id", { count: "exact", head: true })
    .eq("invited_by", userId)
    .gte("created_at", since);
  if (error) return; // Never block an invitation because the count failed.
  if ((count ?? 0) >= HOURLY_INVITE_LIMIT)
    throw new EmailHttpError(
      429,
      "That is a lot of invitations in one hour. Try again later.",
    );
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase, user } = await requireEmailUser();
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success)
      throw new EmailHttpError(
        400,
        "Check the email address and access level.",
      );
    const { email, role } = parsed.data;

    await assertUnderInviteLimit(supabase, user.id);

    const { data, error } = await supabase.rpc("create_household_invitation", {
      invitee_email: email,
      invitee_role: role,
    });
    // The RPC raises for a non-owner, a duplicate member and a malformed
    // address, and its messages are already written for a person to read.
    if (error) throw new EmailHttpError(400, error.message);
    const created = (data as { invitation_token: string }[] | null)?.[0];
    if (!created)
      throw new EmailHttpError(500, "The invitation could not be created.");

    const link = invitationLink(
      new URL(request.url).origin,
      created.invitation_token,
    );

    const sender = houseSender();
    // No outbound mailbox configured: the invitation is still real, and the
    // link is still the way in. Say so rather than reporting a send.
    if (!sender) return Response.json({ link, sent: false });

    // Resolved here rather than taken from the browser: these two strings are
    // the entire claim the email makes about who is asking and what for.
    const { data: activeHousehold } = await supabase.rpc("current_household");
    const [household, profile] = await Promise.all([
      supabase
        .from("households")
        .select("name")
        .eq("id", activeHousehold as string)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    try {
      await sendInvitationMail(
        sender,
        email,
        invitationMessage({
          householdName: household.data?.name?.trim() || "their household",
          inviterName:
            profile.data?.display_name?.trim() ||
            user.email?.split("@")[0] ||
            "Someone",
          link,
          role,
        }),
      );
    } catch (sendError) {
      // The invitation exists and its link is the way in, so a delivery failure
      // must not read as "nothing happened" — the link comes back either way,
      // with the reason it could not be mailed.
      return Response.json({
        link,
        sent: false,
        error:
          sendError instanceof EmailHttpError
            ? sendError.message
            : "The invitation was created, but it could not be emailed.",
      });
    }

    return Response.json({ link, sent: true, from: sender.from });
  } catch (error) {
    return errorResponse(error);
  }
}
