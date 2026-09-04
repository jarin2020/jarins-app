import { z } from "zod";
import {
  assertCalendarSameOrigin,
  calendarErrorResponse,
  CalendarHttpError,
  ownerDisplayName,
  publicCalendarAccount,
  requireCalendarUser,
  saveCalendarCredentials,
  type CalDavCredentials,
} from "@/lib/calendar-server";
import {
  discoverCalDavCalendars,
  upsertDiscoveredSources,
} from "@/lib/calendar-providers";

const inputSchema = z.object({
  provider: z.enum(["apple", "caldav"]),
  address: z.string().trim().min(1).max(320),
  label: z.string().trim().min(1).max(80),
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(500),
  serverUrl: z.url().max(1000),
  syncMode: z.enum(["two-way", "read-only"]),
  included: z.boolean(),
  shareWithHousehold: z.boolean(),
});

export async function POST(request: Request) {
  try {
    assertCalendarSameOrigin(request);
    const context = await requireCalendarUser();
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new CalendarHttpError(400, "Check the CalDAV connection details.");
    const input = parsed.data;
    const credentials: CalDavCredentials = {
      kind: "caldav",
      username: input.username,
      password: input.password,
      serverUrl: input.serverUrl,
    };
    const calendars = await discoverCalDavCalendars(credentials);
    const household = await context.supabase.rpc("current_household");
    if (household.error || !household.data)
      throw new CalendarHttpError(409, "Your household is not ready yet.");
    const accountResult = await context.supabase
      .from("calendar_accounts")
      .upsert(
        {
          user_id: context.user.id,
          household_id: household.data,
          provider: input.provider,
          address: input.address.trim().toLowerCase(),
          label: input.label,
          status: "active",
          sync_mode: input.syncMode,
          included: input.included,
          share_with_household: input.shareWithHousehold,
          provider_account_id: input.username,
          connection_config: {
            serverUrl: input.serverUrl,
            ownerName: await ownerDisplayName(context),
          },
          last_error: null,
        },
        { onConflict: "user_id,provider,address" },
      )
      .select("*")
      .single();
    if (accountResult.error || !accountResult.data)
      throw new CalendarHttpError(
        500,
        "The CalDAV account could not be saved.",
      );
    await saveCalendarCredentials(context, accountResult.data.id, credentials);
    await upsertDiscoveredSources(context, accountResult.data.id, calendars);
    const refreshed = await context.supabase
      .from("calendar_accounts")
      .select("*")
      .eq("id", accountResult.data.id)
      .single();
    return Response.json(
      {
        account: await publicCalendarAccount(
          context.supabase,
          refreshed.data ?? accountResult.data,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
