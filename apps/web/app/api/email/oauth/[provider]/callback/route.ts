import { NextResponse } from "next/server";
import type { EmailProvider } from "@/lib/email";
import { decryptSecret, sha256Hex } from "@/lib/email-security";
import type { OAuthCredentials } from "@/lib/email-server";
import {
  EmailHttpError,
  requireEmailUser,
  saveCredentials,
} from "@/lib/email-server";
import { providerFetch, readLimitedJson } from "@/lib/provider-http";

const fetch = providerFetch;

type OAuthStateRow = {
  state_hash: string;
  provider: EmailProvider;
  label: string;
  expected_address: string | null;
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
  const url = new URL("/inbox", request.url);
  url.searchParams.set("email", status);
  if (message) url.searchParams.set("reason", message.slice(0, 160));
  return NextResponse.redirect(url);
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new EmailHttpError(503, `${name} is not configured.`);
  return value;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const context = await requireEmailUser();
    const provider = (await params).provider;
    if (provider !== "gmail" && provider !== "outlook") {
      throw new EmailHttpError(404, "Unknown email provider.");
    }
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const oauthError = url.searchParams.get("error");
    if (oauthError)
      return redirect(request, "error", "Authorization was cancelled.");
    if (!state || !code)
      throw new EmailHttpError(400, "Authorization response is incomplete.");

    const stateResult = await context.supabase
      .from("email_oauth_states")
      .select("*")
      .eq("state_hash", await sha256Hex(state))
      .eq("provider", provider)
      .single();
    if (stateResult.error || !stateResult.data) {
      throw new EmailHttpError(400, "Authorization state is invalid.");
    }
    const savedState = stateResult.data as OAuthStateRow;
    if (savedState.used_at || new Date(savedState.expires_at) <= new Date()) {
      throw new EmailHttpError(
        400,
        "Authorization state expired. Start again.",
      );
    }
    const verifier = await decryptSecret<string>(
      savedState.verifier_ciphertext,
      savedState.verifier_iv,
    );
    const origin = process.env.EMAIL_OAUTH_REDIRECT_ORIGIN || url.origin;
    const tokenBody = new URLSearchParams({
      client_id: required(
        provider === "gmail"
          ? "GOOGLE_EMAIL_CLIENT_ID"
          : "MICROSOFT_EMAIL_CLIENT_ID",
      ),
      client_secret: required(
        provider === "gmail"
          ? "GOOGLE_EMAIL_CLIENT_SECRET"
          : "MICROSOFT_EMAIL_CLIENT_SECRET",
      ),
      code,
      code_verifier: verifier,
      redirect_uri: `${origin}/api/email/oauth/${provider}/callback`,
      grant_type: "authorization_code",
    });
    const tokenResponse = await fetch(
      provider === "gmail"
        ? "https://oauth2.googleapis.com/token"
        : "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      { method: "POST", body: tokenBody },
    );
    if (!tokenResponse.ok)
      throw new EmailHttpError(502, "The provider rejected authorization.");
    const token = await readLimitedJson<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    }>(tokenResponse, 1024 * 1024);
    if (!token.refresh_token) {
      throw new EmailHttpError(
        409,
        "The provider did not grant offline mailbox access.",
      );
    }

    let address: string;
    let providerAccountId: string;
    if (provider === "gmail") {
      const profileResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        { headers: { Authorization: `Bearer ${token.access_token}` } },
      );
      if (!profileResponse.ok)
        throw new EmailHttpError(502, "Google mailbox profile failed.");
      const profile = await readLimitedJson<{
        emailAddress: string;
        historyId: string;
      }>(profileResponse, 1024 * 1024);
      address = profile.emailAddress.toLowerCase();
      providerAccountId = profile.emailAddress.toLowerCase();
    } else {
      const profileResponse = await fetch(
        "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName",
        { headers: { Authorization: `Bearer ${token.access_token}` } },
      );
      if (!profileResponse.ok)
        throw new EmailHttpError(502, "Microsoft mailbox profile failed.");
      const profile = await readLimitedJson<{
        id: string;
        mail?: string;
        userPrincipalName: string;
      }>(profileResponse, 1024 * 1024);
      address = (profile.mail || profile.userPrincipalName).toLowerCase();
      providerAccountId = profile.id;
    }
    if (
      savedState.expected_address &&
      savedState.expected_address !== address
    ) {
      throw new EmailHttpError(
        409,
        "The authorized mailbox did not match the requested email address.",
      );
    }
    const accountResult = await context.supabase
      .from("email_accounts")
      .upsert(
        {
          user_id: context.user.id,
          provider,
          address,
          label: savedState.label,
          status: "active",
          provider_account_id: providerAccountId,
          connection_config: {},
          last_error: null,
        },
        { onConflict: "user_id,provider,address" },
      )
      .select("id")
      .single();
    if (accountResult.error || !accountResult.data) {
      throw new EmailHttpError(
        500,
        "The connected mailbox could not be saved.",
      );
    }
    const credentials: OAuthCredentials = {
      kind: "oauth",
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      scope: token.scope,
    };
    await saveCredentials(context, accountResult.data.id, credentials);
    await context.supabase
      .from("email_oauth_states")
      .update({ used_at: new Date().toISOString() })
      .eq("state_hash", savedState.state_hash);
    return redirect(request, "connected");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Email authorization failed.";
    return redirect(request, "error", message);
  }
}
