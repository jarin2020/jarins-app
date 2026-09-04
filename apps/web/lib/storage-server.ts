import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  StorageAccount,
  StorageItem,
  StorageProvider,
} from "@/lib/storage-accounts";
import { decryptSecret, encryptSecret } from "@/lib/email-security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StorageOAuthCredentials = {
  kind: "oauth";
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
};

export type WebDavCredentials = {
  kind: "webdav";
  username: string;
  password: string;
  serverUrl: string;
};

export type StorageCredentials = StorageOAuthCredentials | WebDavCredentials;

export type StorageAccountRow = {
  id: string;
  user_id: string;
  provider: StorageProvider;
  address: string;
  label: string;
  status: StorageAccount["status"];
  access_mode: StorageAccount["accessMode"];
  include_in_search: boolean;
  provider_account_id: string | null;
  root_provider_item_id: string;
  connection_config: Record<string, unknown>;
  sync_cursor: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type StorageItemRow = {
  id: string;
  account_id: string;
  user_id: string;
  provider_item_id: string;
  parent_provider_item_id: string | null;
  path: string;
  name: string;
  item_kind: StorageItem["kind"];
  mime_type: string | null;
  size_bytes: number | null;
  modified_at: string | null;
  web_url: string | null;
  provider_etag: string | null;
  content_hash: string | null;
  can_download: boolean;
  can_edit: boolean;
};

type CredentialRow = { ciphertext: string; iv: string };

export type StorageRequestContext = {
  supabase: SupabaseClient;
  user: User;
};

export class StorageHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireStorageUser(): Promise<StorageRequestContext> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new StorageHttpError(503, "Supabase is not configured.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new StorageHttpError(401, "Sign in required.");
  return { supabase, user: data.user };
}

export function storageErrorResponse(error: unknown) {
  const status = error instanceof StorageHttpError ? error.status : 500;
  const message =
    error instanceof StorageHttpError
      ? error.message
      : "The storage request failed. Please try again.";
  if (!(error instanceof StorageHttpError)) {
    console.error(
      JSON.stringify({
        message: "storage request failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
  return Response.json({ error: message }, { status });
}

export function assertStorageSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new StorageHttpError(
      403,
      "This storage request did not come from Jarins.",
    );
  }
}

function encryptionConfigured() {
  return Boolean(
    process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY ||
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY,
  );
}

export function storageProviderConfiguration() {
  const encryption = encryptionConfigured();
  return {
    encryption,
    googleDrive: Boolean(
      googleStorageClientId(false) &&
      googleStorageClientSecret(false) &&
      encryption,
    ),
    onedrive: Boolean(
      microsoftStorageClientId(false) &&
      microsoftStorageClientSecret(false) &&
      encryption,
    ),
    dropbox: Boolean(
      process.env.DROPBOX_STORAGE_CLIENT_ID &&
      process.env.DROPBOX_STORAGE_CLIENT_SECRET &&
      encryption,
    ),
    webdav: encryption,
  };
}

function configuredValue(
  candidates: Array<string | undefined>,
  message: string,
  required: boolean,
) {
  const value = candidates.find(Boolean);
  if (!value && required) throw new StorageHttpError(503, message);
  return value || "";
}

export function googleStorageClientId(required = true) {
  return configuredValue(
    [
      process.env.GOOGLE_STORAGE_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_EMAIL_CLIENT_ID,
    ],
    "Google Drive OAuth is not configured.",
    required,
  );
}

export function googleStorageClientSecret(required = true) {
  return configuredValue(
    [
      process.env.GOOGLE_STORAGE_CLIENT_SECRET,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      process.env.GOOGLE_EMAIL_CLIENT_SECRET,
    ],
    "Google Drive OAuth is not configured.",
    required,
  );
}

export function microsoftStorageClientId(required = true) {
  return configuredValue(
    [
      process.env.MICROSOFT_STORAGE_CLIENT_ID,
      process.env.MICROSOFT_CALENDAR_CLIENT_ID,
      process.env.MICROSOFT_EMAIL_CLIENT_ID,
    ],
    "Microsoft OneDrive OAuth is not configured.",
    required,
  );
}

export function microsoftStorageClientSecret(required = true) {
  return configuredValue(
    [
      process.env.MICROSOFT_STORAGE_CLIENT_SECRET,
      process.env.MICROSOFT_CALENDAR_CLIENT_SECRET,
      process.env.MICROSOFT_EMAIL_CLIENT_SECRET,
    ],
    "Microsoft OneDrive OAuth is not configured.",
    required,
  );
}

export function dropboxStorageClientId(required = true) {
  return configuredValue(
    [process.env.DROPBOX_STORAGE_CLIENT_ID],
    "Dropbox OAuth is not configured.",
    required,
  );
}

export function dropboxStorageClientSecret(required = true) {
  return configuredValue(
    [process.env.DROPBOX_STORAGE_CLIENT_SECRET],
    "Dropbox OAuth is not configured.",
    required,
  );
}

export function storageOAuthProvider(value: string) {
  if (value === "google-drive" || value === "onedrive" || value === "dropbox")
    return value;
  throw new StorageHttpError(404, "Storage provider not found.");
}

export function publicStorageItem(row: StorageItemRow): StorageItem {
  return {
    id: row.id,
    accountId: row.account_id,
    providerItemId: row.provider_item_id,
    parentProviderItemId: row.parent_provider_item_id,
    path: row.path,
    name: row.name,
    kind: row.item_kind,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    modifiedAt: row.modified_at,
    webUrl: row.web_url,
    canDownload: row.can_download,
    canEdit: row.can_edit,
  };
}

export async function publicStorageAccount(
  supabase: SupabaseClient,
  row: StorageAccountRow,
): Promise<StorageAccount> {
  const result = await supabase
    .from("storage_items")
    .select("id", { count: "exact", head: true })
    .eq("account_id", row.id);
  return {
    id: row.id,
    provider: row.provider,
    address: row.address,
    label: row.label,
    status: row.status,
    accessMode: row.access_mode,
    includeInSearch: row.include_in_search,
    rootProviderItemId: row.root_provider_item_id,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    itemCount: result.count ?? 0,
  };
}

export async function loadOwnedStorageAccount(
  context: StorageRequestContext,
  accountId: string,
) {
  const accountResult = await context.supabase
    .from("storage_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (accountResult.error || !accountResult.data)
    throw new StorageHttpError(404, "Storage account not found.");
  const credentialResult = await context.supabase
    .from("storage_credentials")
    .select("ciphertext,iv")
    .eq("account_id", accountId)
    .single();
  if (credentialResult.error || !credentialResult.data)
    throw new StorageHttpError(409, "This storage account needs reconnecting.");
  const credential = credentialResult.data as CredentialRow;
  return {
    account: accountResult.data as StorageAccountRow,
    credentials: await decryptSecret<StorageCredentials>(
      credential.ciphertext,
      credential.iv,
    ),
  };
}

export async function loadOwnedStorageItem(
  context: StorageRequestContext,
  itemId: string,
) {
  const result = await context.supabase
    .from("storage_items")
    .select("*")
    .eq("id", itemId)
    .single();
  if (result.error || !result.data)
    throw new StorageHttpError(404, "File or folder not found.");
  const item = result.data as StorageItemRow;
  return { item, ...(await loadOwnedStorageAccount(context, item.account_id)) };
}

export async function saveStorageCredentials(
  context: StorageRequestContext,
  accountId: string,
  credentials: StorageCredentials,
) {
  const encrypted = await encryptSecret(credentials);
  const result = await context.supabase.from("storage_credentials").upsert(
    {
      account_id: accountId,
      user_id: context.user.id,
      ...encrypted,
      key_version: 1,
    },
    { onConflict: "account_id" },
  );
  if (result.error)
    throw new StorageHttpError(500, "Storage credentials could not be saved.");
}

export async function markStorageAccountError(
  context: StorageRequestContext,
  accountId: string,
  error: unknown,
) {
  const message =
    error instanceof StorageHttpError
      ? error.message
      : "Storage sync failed. Check the provider settings and try again.";
  await context.supabase
    .from("storage_accounts")
    .update({ status: "error", last_error: message.slice(0, 500) })
    .eq("id", accountId);
}

export function requireManageAccess(account: StorageAccountRow) {
  if (account.access_mode !== "manage")
    throw new StorageHttpError(
      403,
      "Reconnect or change this storage account to Manage files first.",
    );
}
