import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const exportTables = [
  "profiles",
  "households",
  "household_members",
  "life_records",
  "message_teams",
  "message_team_members",
  "message_threads",
  "message_thread_members",
  "message_thread_teams",
  "messages",
  "message_attachments",
  "message_notifications",
  "email_accounts",
  "email_messages",
  "calendar_accounts",
  "calendar_sources",
  "calendar_events",
  "storage_accounts",
  "storage_items",
  "audit_events",
] as const;

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json(
      { error: "Accounts are not configured." },
      { status: 503 },
    );

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user)
    return NextResponse.json(
      { error: "Sign in to export account data." },
      { status: 401 },
    );

  const entries = await Promise.all(
    exportTables.map(async (table) => {
      const { data, error } = await supabase.from(table).select("*");
      if (error) throw new Error(`${table}: ${error.message}`);
      return [table, data ?? []] as const;
    }),
  );
  const { data: directory, error: directoryError } = await supabase.rpc(
    "list_household_users",
  );
  if (directoryError)
    throw new Error(`household_directory: ${directoryError.message}`);

  const payload = {
    format: "jarins-account-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    account: {
      id: auth.user.id,
      email: auth.user.email,
      createdAt: auth.user.created_at,
      lastSignInAt: auth.user.last_sign_in_at,
    },
    householdDirectory: directory ?? [],
    data: Object.fromEntries(entries),
    excludedForSecurity: [
      "OAuth refresh/access tokens",
      "IMAP, SMTP, CalDAV, and WebDAV passwords",
      "OAuth state verifiers",
      "remote email bodies and attachment bytes",
      "remote VAULT file bytes",
    ],
  };
  const date = payload.exportedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="jarins-account-${date}.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
