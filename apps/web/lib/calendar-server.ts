import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  CalendarAccount,
  CalendarEvent,
  CalendarProvider,
  CalendarSource,
} from "@/lib/calendar";
import { decryptSecret, encryptSecret } from "@/lib/email-security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CalendarOAuthCredentials = {
  kind: "oauth";
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
};

export type CalDavCredentials = {
  kind: "caldav";
  username: string;
  password: string;
  serverUrl: string;
};

export type CalendarCredentials = CalendarOAuthCredentials | CalDavCredentials;

export type CalendarAccountRow = {
  id: string;
  user_id: string;
  household_id: string;
  provider: CalendarProvider;
  address: string;
  label: string;
  status: CalendarAccount["status"];
  sync_mode: CalendarAccount["syncMode"];
  included: boolean;
  share_with_household: boolean;
  provider_account_id: string | null;
  connection_config: Record<string, unknown>;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarSourceRow = {
  id: string;
  account_id: string;
  user_id: string;
  provider_calendar_id: string;
  name: string;
  color: string | null;
  is_primary: boolean;
  can_write: boolean;
  selected: boolean;
  sync_cursor: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarEventRow = {
  id: string;
  source_id: string;
  account_id: string;
  owner_user_id: string;
  household_id: string | null;
  provider_event_id: string;
  source_name: string;
  owner_name: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  timezone: string;
  status: CalendarEvent["status"];
  organizer: CalendarEvent["organizer"];
  attendees: CalendarEvent["attendees"];
  recurrence: string[];
  provider_etag: string | null;
  provider_url: string | null;
};

type CredentialRow = { ciphertext: string; iv: string };

export type CalendarRequestContext = {
  supabase: SupabaseClient;
  user: User;
};

export class CalendarHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireCalendarUser(): Promise<CalendarRequestContext> {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    throw new CalendarHttpError(503, "Supabase is not configured.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user)
    throw new CalendarHttpError(401, "Sign in required.");
  return { supabase, user: data.user };
}

export function calendarErrorResponse(error: unknown) {
  const status = error instanceof CalendarHttpError ? error.status : 500;
  const message =
    error instanceof CalendarHttpError
      ? error.message
      : "The calendar request failed. Please try again.";
  return Response.json({ error: message }, { status });
}

export function assertCalendarSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (!origin || origin !== expected) {
    throw new CalendarHttpError(
      403,
      "This calendar request did not come from Jarins.",
    );
  }
}

export function calendarProviderConfiguration() {
  const encryption = Boolean(
    process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY ||
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY,
  );
  return {
    encryption,
    google: Boolean(
      (process.env.GOOGLE_CALENDAR_CLIENT_ID ||
        process.env.GOOGLE_EMAIL_CLIENT_ID) &&
      (process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
        process.env.GOOGLE_EMAIL_CLIENT_SECRET) &&
      encryption,
    ),
    microsoft: Boolean(
      (process.env.MICROSOFT_CALENDAR_CLIENT_ID ||
        process.env.MICROSOFT_EMAIL_CLIENT_ID) &&
      (process.env.MICROSOFT_CALENDAR_CLIENT_SECRET ||
        process.env.MICROSOFT_EMAIL_CLIENT_SECRET) &&
      encryption,
    ),
    caldav: encryption,
    apple: encryption,
  };
}

export function calendarClientId(provider: "google" | "microsoft") {
  const value =
    provider === "google"
      ? process.env.GOOGLE_CALENDAR_CLIENT_ID ||
        process.env.GOOGLE_EMAIL_CLIENT_ID
      : process.env.MICROSOFT_CALENDAR_CLIENT_ID ||
        process.env.MICROSOFT_EMAIL_CLIENT_ID;
  if (!value)
    throw new CalendarHttpError(
      503,
      `${provider === "google" ? "Google" : "Microsoft"} Calendar OAuth is not configured.`,
    );
  return value;
}

export function calendarClientSecret(provider: "google" | "microsoft") {
  const value =
    provider === "google"
      ? process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
        process.env.GOOGLE_EMAIL_CLIENT_SECRET
      : process.env.MICROSOFT_CALENDAR_CLIENT_SECRET ||
        process.env.MICROSOFT_EMAIL_CLIENT_SECRET;
  if (!value)
    throw new CalendarHttpError(
      503,
      `${provider === "google" ? "Google" : "Microsoft"} Calendar OAuth is not configured.`,
    );
  return value;
}

export function publicCalendarSource(row: CalendarSourceRow): CalendarSource {
  return {
    id: row.id,
    accountId: row.account_id,
    providerCalendarId: row.provider_calendar_id,
    name: row.name,
    color: row.color,
    isPrimary: row.is_primary,
    canWrite: row.can_write,
    selected: row.selected,
  };
}

export async function publicCalendarAccount(
  supabase: SupabaseClient,
  row: CalendarAccountRow,
): Promise<CalendarAccount> {
  const [sourceResult, eventResult] = await Promise.all([
    supabase
      .from("calendar_sources")
      .select("*")
      .eq("account_id", row.id)
      .order("is_primary", { ascending: false })
      .order("name"),
    supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("account_id", row.id)
      .neq("status", "cancelled"),
  ]);
  return {
    id: row.id,
    provider: row.provider,
    address: row.address,
    label: row.label,
    status: row.status,
    syncMode: row.sync_mode,
    included: row.included,
    shareWithHousehold: row.share_with_household,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    eventCount: eventResult.count ?? 0,
    sources: (sourceResult.data ?? []).map((source) =>
      publicCalendarSource(source as CalendarSourceRow),
    ),
  };
}

export function publicCalendarEvent(
  row: CalendarEventRow,
  currentUserId: string,
): CalendarEvent {
  return {
    id: row.id,
    sourceId: row.source_id,
    accountId: row.account_id,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
    sourceName: row.source_name,
    providerEventId: row.provider_event_id,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    timezone: row.timezone,
    status: row.status,
    organizer: row.organizer,
    attendees: row.attendees ?? [],
    recurrence: row.recurrence ?? [],
    editable: row.owner_user_id === currentUserId,
    sharedWithHousehold: Boolean(row.household_id),
  };
}

export async function loadOwnedCalendarAccount(
  context: CalendarRequestContext,
  accountId: string,
) {
  const accountResult = await context.supabase
    .from("calendar_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (accountResult.error || !accountResult.data)
    throw new CalendarHttpError(404, "Calendar account not found.");
  const credentialResult = await context.supabase
    .from("calendar_credentials")
    .select("ciphertext,iv")
    .eq("account_id", accountId)
    .single();
  if (credentialResult.error || !credentialResult.data) {
    throw new CalendarHttpError(409, "This calendar needs to be reconnected.");
  }
  const credential = credentialResult.data as CredentialRow;
  return {
    account: accountResult.data as CalendarAccountRow,
    credentials: await decryptSecret<CalendarCredentials>(
      credential.ciphertext,
      credential.iv,
    ),
  };
}

export async function saveCalendarCredentials(
  context: CalendarRequestContext,
  accountId: string,
  credentials: CalendarCredentials,
) {
  const encrypted = await encryptSecret(credentials);
  const { error } = await context.supabase.from("calendar_credentials").upsert(
    {
      account_id: accountId,
      user_id: context.user.id,
      ...encrypted,
      key_version: 1,
    },
    { onConflict: "account_id" },
  );
  if (error)
    throw new CalendarHttpError(
      500,
      "Calendar credentials could not be saved.",
    );
}

export async function ownerDisplayName(context: CalendarRequestContext) {
  const result = await context.supabase
    .from("profiles")
    .select("display_name")
    .eq("id", context.user.id)
    .maybeSingle();
  return (
    (result.data?.display_name as string | undefined)?.trim() ||
    (context.user.user_metadata.display_name as string | undefined)?.trim() ||
    context.user.email?.split("@")[0] ||
    "Family member"
  ).slice(0, 80);
}

export async function markCalendarAccountError(
  context: CalendarRequestContext,
  accountId: string,
  error: unknown,
) {
  const message =
    error instanceof CalendarHttpError
      ? error.message
      : "Calendar sync failed. Check the provider settings and try again.";
  await context.supabase
    .from("calendar_accounts")
    .update({ status: "error", last_error: message.slice(0, 500) })
    .eq("id", accountId);
}
