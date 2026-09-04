import { z } from "zod";
import {
  assertCalendarSameOrigin,
  calendarClientId,
  calendarErrorResponse,
  CalendarHttpError,
  requireCalendarUser,
} from "@/lib/calendar-server";
import { providerForOAuth } from "@/lib/calendar-providers";
import {
  encryptSecret,
  pkceChallenge,
  randomUrlToken,
  sha256Hex,
} from "@/lib/email-security";

const inputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  expectedAddress: z.union([z.literal(""), z.email().max(320)]).optional(),
  syncMode: z.enum(["two-way", "read-only"]),
  included: z.boolean(),
  shareWithHousehold: z.boolean(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    assertCalendarSameOrigin(request);
    const context = await requireCalendarUser();
    const provider = providerForOAuth((await params).provider);
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new CalendarHttpError(
        400,
        "Check the calendar connection details.",
      );
    const state = randomUrlToken();
    const verifier = randomUrlToken(64);
    const encryptedVerifier = await encryptSecret(verifier);
    await context.supabase
      .from("calendar_oauth_states")
      .delete()
      .lt("expires_at", new Date().toISOString());
    const { error } = await context.supabase
      .from("calendar_oauth_states")
      .insert({
        state_hash: await sha256Hex(state),
        user_id: context.user.id,
        provider,
        label: parsed.data.label,
        expected_address:
          parsed.data.expectedAddress?.trim().toLowerCase() || null,
        sync_mode: parsed.data.syncMode,
        included: parsed.data.included,
        share_with_household: parsed.data.shareWithHousehold,
        verifier_ciphertext: encryptedVerifier.ciphertext,
        verifier_iv: encryptedVerifier.iv,
      });
    if (error)
      throw new CalendarHttpError(
        500,
        "Secure calendar authorization could not start.",
      );

    const origin =
      process.env.CALENDAR_OAUTH_REDIRECT_ORIGIN || new URL(request.url).origin;
    const redirectUri = `${origin}/api/calendar/oauth/${provider}/callback`;
    const query = new URLSearchParams({
      client_id: calendarClientId(provider),
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: "S256",
    });
    if (provider === "google") {
      query.set(
        "scope",
        [
          "openid",
          "email",
          parsed.data.syncMode === "two-way"
            ? "https://www.googleapis.com/auth/calendar"
            : "https://www.googleapis.com/auth/calendar.readonly",
        ].join(" "),
      );
      query.set("access_type", "offline");
      query.set("prompt", "consent");
      query.set("include_granted_scopes", "true");
      if (parsed.data.expectedAddress)
        query.set("login_hint", parsed.data.expectedAddress);
      return Response.json({
        url: `https://accounts.google.com/o/oauth2/v2/auth?${query}`,
      });
    }
    query.set(
      "scope",
      `openid profile email offline_access User.Read ${
        parsed.data.syncMode === "two-way"
          ? "Calendars.ReadWrite"
          : "Calendars.Read"
      }`,
    );
    query.set("response_mode", "query");
    if (parsed.data.expectedAddress)
      query.set("login_hint", parsed.data.expectedAddress);
    return Response.json({
      url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${query}`,
    });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
