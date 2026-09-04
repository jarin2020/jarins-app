import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { EmailAccount, EmailProvider } from "@/lib/email";
import { decryptSecret, encryptSecret } from "@/lib/email-security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OAuthCredentials = {
  kind: "oauth";
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
};

export type CustomCredentials = {
  kind: "password";
  username: string;
  password: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
};

export type EmailCredentials = OAuthCredentials | CustomCredentials;

export type EmailAccountRow = {
  id: string;
  user_id: string;
  provider: EmailProvider;
  address: string;
  label: string;
  status: EmailAccount["status"];
  provider_account_id: string | null;
  connection_config: Record<string, unknown>;
  sync_cursor: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type CredentialRow = {
  ciphertext: string;
  iv: string;
};

export type EmailRequestContext = {
  supabase: SupabaseClient;
  user: User;
};

export async function requireEmailUser(): Promise<EmailRequestContext> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new EmailHttpError(503, "Supabase is not configured.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new EmailHttpError(401, "Sign in required.");
  return { supabase, user: data.user };
}

export class EmailHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  const status = error instanceof EmailHttpError ? error.status : 500;
  const message =
    error instanceof EmailHttpError
      ? error.message
      : "The email request failed. Please try again.";
  return Response.json({ error: message }, { status });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (!origin || origin !== expected) {
    throw new EmailHttpError(
      403,
      "This email request did not come from Jarins.",
    );
  }
}

export function providerConfiguration() {
  const encryption = Boolean(
    process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY ||
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY,
  );
  return {
    encryption,
    gmail: Boolean(
      process.env.GOOGLE_EMAIL_CLIENT_ID &&
      process.env.GOOGLE_EMAIL_CLIENT_SECRET &&
      encryption,
    ),
    outlook: Boolean(
      process.env.MICROSOFT_EMAIL_CLIENT_ID &&
      process.env.MICROSOFT_EMAIL_CLIENT_SECRET &&
      encryption,
    ),
    custom: encryption,
  };
}

export async function publicAccount(
  supabase: SupabaseClient,
  row: EmailAccountRow,
): Promise<EmailAccount> {
  const { count } = await supabase
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("account_id", row.id)
    .eq("is_read", false);
  return {
    id: row.id,
    provider: row.provider,
    address: row.address,
    label: row.label,
    status: row.status,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    unreadCount: count ?? 0,
  };
}

export async function loadOwnedAccount(
  context: EmailRequestContext,
  accountId: string,
) {
  const accountResult = await context.supabase
    .from("email_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (accountResult.error || !accountResult.data) {
    throw new EmailHttpError(404, "Email account not found.");
  }
  const credentialResult = await context.supabase
    .from("email_credentials")
    .select("ciphertext,iv")
    .eq("account_id", accountId)
    .single();
  if (credentialResult.error || !credentialResult.data) {
    throw new EmailHttpError(
      409,
      "This email account needs to be reconnected.",
    );
  }
  const credentialRow = credentialResult.data as CredentialRow;
  return {
    account: accountResult.data as EmailAccountRow,
    credentials: await decryptSecret<EmailCredentials>(
      credentialRow.ciphertext,
      credentialRow.iv,
    ),
  };
}

export async function saveCredentials(
  context: EmailRequestContext,
  accountId: string,
  credentials: EmailCredentials,
) {
  const encrypted = await encryptSecret(credentials);
  const { error } = await context.supabase.from("email_credentials").upsert(
    {
      account_id: accountId,
      user_id: context.user.id,
      ...encrypted,
      key_version: 1,
    },
    { onConflict: "account_id" },
  );
  if (error)
    throw new EmailHttpError(500, "Email credentials could not be saved.");
}

export async function markAccountError(
  context: EmailRequestContext,
  accountId: string,
  error: unknown,
) {
  const message =
    error instanceof EmailHttpError
      ? error.message
      : "Mailbox sync failed. Check the provider settings and try again.";
  await context.supabase
    .from("email_accounts")
    .update({ status: "error", last_error: message.slice(0, 500) })
    .eq("id", accountId);
}
