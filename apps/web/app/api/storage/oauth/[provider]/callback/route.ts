import { NextResponse } from "next/server";
import { decryptSecret, sha256Hex } from "@/lib/email-security";
import {
  dropboxStorageClientId,
  dropboxStorageClientSecret,
  googleStorageClientId,
  googleStorageClientSecret,
  microsoftStorageClientId,
  microsoftStorageClientSecret,
  requireStorageUser,
  saveStorageCredentials,
  StorageHttpError,
  storageOAuthProvider,
  type StorageOAuthCredentials,
} from "@/lib/storage-server";
import { synchronizeStorageAccount } from "@/lib/storage-sync";

type OAuthStateRow = {
  state_hash: string;
  provider: "google-drive" | "onedrive" | "dropbox";
  label: string;
  expected_address: string | null;
  access_mode: "view" | "manage";
  include_in_search: boolean;
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
  const url = new URL("/vault", request.url);
  url.searchParams.set("storage", status);
  if (message) url.searchParams.set("reason", message.slice(0, 160));
  return NextResponse.redirect(url);
}

async function checkedJson<T>(response: Response, message: string): Promise<T> {
  if (!response.ok) throw new StorageHttpError(502, message);
  return (await response.json()) as T;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const context = await requireStorageUser();
    const provider = storageOAuthProvider((await params).provider);
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (url.searchParams.get("error"))
      return redirect(request, "error", "Authorization was cancelled.");
    if (!state || !code)
      throw new StorageHttpError(400, "Authorization response is incomplete.");
    const stateResult = await context.supabase
      .from("storage_oauth_states")
      .select("*")
      .eq("state_hash", await sha256Hex(state))
      .eq("provider", provider)
      .single();
    if (stateResult.error || !stateResult.data)
      throw new StorageHttpError(400, "Authorization state is invalid.");
    const savedState = stateResult.data as OAuthStateRow;
    if (savedState.used_at || new Date(savedState.expires_at) <= new Date())
      throw new StorageHttpError(
        400,
        "Authorization state expired. Start again.",
      );

    const origin = process.env.STORAGE_OAUTH_REDIRECT_ORIGIN || url.origin;
    const redirectUri = `${origin}/api/storage/oauth/${provider}/callback`;
    const verifier = await decryptSecret<string>(
      savedState.verifier_ciphertext,
      savedState.verifier_iv,
    );
    let token: {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (provider === "dropbox") {
      token = await checkedJson(
        await fetch("https://api.dropboxapi.com/oauth2/token", {
          method: "POST",
          body: new URLSearchParams({
            client_id: dropboxStorageClientId(),
            client_secret: dropboxStorageClientSecret(),
            code,
            code_verifier: verifier,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        }),
        "Dropbox rejected storage authorization.",
      );
    } else {
      token = await checkedJson(
        await fetch(
          provider === "google-drive"
            ? "https://oauth2.googleapis.com/token"
            : "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          {
            method: "POST",
            body: new URLSearchParams({
              client_id:
                provider === "google-drive"
                  ? googleStorageClientId()
                  : microsoftStorageClientId(),
              client_secret:
                provider === "google-drive"
                  ? googleStorageClientSecret()
                  : microsoftStorageClientSecret(),
              code,
              code_verifier: verifier,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
            }),
          },
        ),
        "The provider rejected storage authorization.",
      );
    }
    if (!token.refresh_token)
      throw new StorageHttpError(
        409,
        "The provider did not grant offline storage access.",
      );

    let address: string;
    let providerAccountId: string;
    if (provider === "google-drive") {
      const profile = await checkedJson<{ id: string; email: string }>(
        await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${token.access_token}` },
        }),
        "Google account details could not be loaded.",
      );
      address = profile.email.toLowerCase();
      providerAccountId = profile.id;
    } else if (provider === "onedrive") {
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
    } else {
      const profile = await checkedJson<{
        account_id: string;
        email: string;
      }>(
        await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
          method: "POST",
          headers: { Authorization: `Bearer ${token.access_token}` },
        }),
        "Dropbox account details could not be loaded.",
      );
      address = profile.email.toLowerCase();
      providerAccountId = profile.account_id;
    }
    if (savedState.expected_address && savedState.expected_address !== address)
      throw new StorageHttpError(
        409,
        "The authorized account did not match the requested email address.",
      );

    const accountResult = await context.supabase
      .from("storage_accounts")
      .upsert(
        {
          user_id: context.user.id,
          provider,
          address,
          label: savedState.label,
          status: "active",
          access_mode: savedState.access_mode,
          include_in_search: savedState.include_in_search,
          provider_account_id: providerAccountId,
          last_error: null,
        },
        { onConflict: "user_id,provider,address" },
      )
      .select("id")
      .single();
    if (accountResult.error || !accountResult.data)
      throw new StorageHttpError(
        500,
        "The connected storage could not be saved.",
      );
    const credentials: StorageOAuthCredentials = {
      kind: "oauth",
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + (token.expires_in ?? 14_400) * 1000,
      scope: token.scope || "",
    };
    await saveStorageCredentials(context, accountResult.data.id, credentials);
    await context.supabase
      .from("storage_oauth_states")
      .update({ used_at: new Date().toISOString() })
      .eq("state_hash", savedState.state_hash);
    await synchronizeStorageAccount(context, accountResult.data.id);
    return redirect(request, "connected");
  } catch (error) {
    return redirect(
      request,
      "error",
      error instanceof Error ? error.message : "Storage authorization failed.",
    );
  }
}
