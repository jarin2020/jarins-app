import { NextResponse } from "next/server";
import {
  calendarClientId,
  calendarClientSecret,
  CalendarHttpError,
  ownerDisplayName,
  requireCalendarUser,
  saveCalendarCredentials,
  type CalendarOAuthCredentials,
} from "@/lib/calendar-server";
import {
  discoverOAuthCalendars,
  providerForOAuth,
  upsertDiscoveredSources,
} from "@/lib/calendar-providers";
import { decryptSecret, sha256Hex } from "@/lib/email-security";
import { providerFetch, readLimitedJson } from "@/lib/provider-http";

const fetch = providerFetch;

type OAuthStateRow = {
  state_hash: string;
  provider: "google" | "microsoft";
  label: string;
  expected_address: string | null;
  sync_mode: "two-way" | "read-only";
  included: boolean;
  share_with_household: boolean;
  verifier_ciphertext: string;
  verifier_iv: string;
  expires_at: string;
  used_at: string | null;
};

function redirect(
  request: Request,
  status: "connected" | "error",
  message?: string,
) {
  const url = new URL("/calendar", request.url);
  url.searchParams.set("calendar", status);
  if (message) url.searchParams.set("reason", message.slice(0, 160));
  return NextResponse.redirect(url);
}

async function checkedJson<T>(response: Response, message: string): Promise<T> {
  if (!response.ok) throw new CalendarHttpError(502, message);
  return readLimitedJson<T>(response, 1024 * 1024);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const context = await requireCalendarUser();
    const provider = providerForOAuth((await params).provider);
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (url.searchParams.get("error"))
      return redirect(request, "error", "Authorization was cancelled.");
    if (!state || !code)
      throw new CalendarHttpError(400, "Authorization response is incomplete.");
    const stateResult = await context.supabase
      .from("calendar_oauth_states")
      .select("*")
      .eq("state_hash", await sha256Hex(state))
      .eq("provider", provider)
      .single();
    if (stateResult.error || !stateResult.data)
      throw new CalendarHttpError(400, "Authorization state is invalid.");
    const savedState = stateResult.data as OAuthStateRow;
    if (savedState.used_at || new Date(savedState.expires_at) <= new Date())
      throw new CalendarHttpError(
        400,
        "Authorization state expired. Start again.",
      );

    const origin = process.env.CALENDAR_OAUTH_REDIRECT_ORIGIN || url.origin;
    const tokenBody = new URLSearchParams({
      client_id: calendarClientId(provider),
      client_secret: calendarClientSecret(provider),
      code,
      code_verifier: await decryptSecret<string>(
        savedState.verifier_ciphertext,
        savedState.verifier_iv,
      ),
      redirect_uri: `${origin}/api/calendar/oauth/${provider}/callback`,
      grant_type: "authorization_code",
    });
    const token = await checkedJson<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    }>(
      await fetch(
        provider === "google"
          ? "https://oauth2.googleapis.com/token"
          : "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        { method: "POST", body: tokenBody },
      ),
      "The provider rejected calendar authorization.",
    );
    if (!token.refresh_token)
      throw new CalendarHttpError(
        409,
        "The provider did not grant offline calendar access.",
      );

    let address: string;
    let providerAccountId: string;
    if (provider === "google") {
      const profile = await checkedJson<{ id: string; email: string }>(
        await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${token.access_token}` },
        }),
        "Google account details could not be loaded.",
      );
      address = profile.email.toLowerCase();
      providerAccountId = profile.id;
    } else {
      const profile = await checkedJson<{
        id: string;
        mail?: string;
        userPrincipalName: string;
      }>(
        await fetch(
          "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName",
          { headers: { Authorization: `Bearer ${token.access_token}` } },
        ),
        "Microsoft account details could not be loaded.",
      );
      address = (profile.mail || profile.userPrincipalName).toLowerCase();
      providerAccountId = profile.id;
    }
    if (savedState.expected_address && savedState.expected_address !== address)
      throw new CalendarHttpError(
        409,
        "The authorized account did not match the requested email address.",
      );

    const household = await context.supabase.rpc("current_household");
    if (household.error || !household.data)
      throw new CalendarHttpError(409, "Your household is not ready yet.");
    const accountResult = await context.supabase
      .from("calendar_accounts")
      .upsert(
        {
          user_id: context.user.id,
          household_id: household.data,
          provider,
          address,
          label: savedState.label,
          status: "active",
          sync_mode: savedState.sync_mode,
          included: savedState.included,
          share_with_household: savedState.share_with_household,
          provider_account_id: providerAccountId,
          connection_config: { ownerName: await ownerDisplayName(context) },
          last_error: null,
        },
        { onConflict: "user_id,provider,address" },
      )
      .select("id")
      .single();
    if (accountResult.error || !accountResult.data)
      throw new CalendarHttpError(
        500,
        "The connected calendar could not be saved.",
      );
    const credentials: CalendarOAuthCredentials = {
      kind: "oauth",
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      scope: token.scope,
    };
    await saveCalendarCredentials(context, accountResult.data.id, credentials);
    const calendars = await discoverOAuthCalendars(
      provider,
      token.access_token,
    );
    await upsertDiscoveredSources(context, accountResult.data.id, calendars);
    await context.supabase
      .from("calendar_oauth_states")
      .update({ used_at: new Date().toISOString() })
      .eq("state_hash", savedState.state_hash);
    return redirect(request, "connected");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Calendar authorization failed.";
    return redirect(request, "error", message);
  }
}
