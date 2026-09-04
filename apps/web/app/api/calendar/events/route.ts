import {
  assertCalendarSameOrigin,
  calendarErrorResponse,
  CalendarHttpError,
  loadOwnedCalendarAccount,
  ownerDisplayName,
  publicCalendarEvent,
  requireCalendarUser,
  type CalendarEventRow,
  type CalendarSourceRow,
} from "@/lib/calendar-server";
import { createProviderEvent } from "@/lib/calendar-providers";
import { calendarEventInputSchema } from "@/lib/calendar-validation";

export async function GET(request: Request) {
  try {
    const context = await requireCalendarUser();
    const url = new URL(request.url);
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 90);
    const defaultTo = new Date(now);
    defaultTo.setUTCDate(defaultTo.getUTCDate() + 400);
    const from = new Date(url.searchParams.get("from") || defaultFrom);
    const to = new Date(url.searchParams.get("to") || defaultTo);
    if (
      Number.isNaN(from.valueOf()) ||
      Number.isNaN(to.valueOf()) ||
      to <= from ||
      to.valueOf() - from.valueOf() > 1000 * 60 * 60 * 24 * 730
    ) {
      throw new CalendarHttpError(400, "Choose a valid calendar date range.");
    }
    let query = context.supabase
      .from("calendar_events")
      .select("*")
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString())
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(5000);
    const accountId = url.searchParams.get("accountId");
    if (accountId) query = query.eq("account_id", accountId);
    const result = await query;
    if (result.error)
      throw new CalendarHttpError(500, "Calendar events could not be loaded.");
    return Response.json(
      {
        events: (result.data ?? []).map((row) =>
          publicCalendarEvent(row as CalendarEventRow, context.user.id),
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return calendarErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertCalendarSameOrigin(request);
    const context = await requireCalendarUser();
    const parsed = calendarEventInputSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new CalendarHttpError(
        400,
        parsed.error.issues[0]?.message || "Check the event details.",
      );
    const sourceResult = await context.supabase
      .from("calendar_sources")
      .select("*")
      .eq("id", parsed.data.sourceId)
      .single();
    if (sourceResult.error || !sourceResult.data)
      throw new CalendarHttpError(404, "Calendar source not found.");
    const source = sourceResult.data as CalendarSourceRow;
    const loaded = await loadOwnedCalendarAccount(context, source.account_id);
    const ownerName = await ownerDisplayName(context);
    const providerEvent = await createProviderEvent(
      context,
      loaded.account,
      loaded.credentials,
      source,
      parsed.data,
      ownerName,
    );
    const saved = await context.supabase
      .from("calendar_events")
      .upsert(
        {
          ...providerEvent,
          source_id: source.id,
          account_id: loaded.account.id,
          owner_user_id: context.user.id,
          household_id: loaded.account.share_with_household
            ? loaded.account.household_id
            : null,
        },
        { onConflict: "source_id,provider_event_id" },
      )
      .select("*")
      .single();
    if (saved.error || !saved.data)
      throw new CalendarHttpError(
        500,
        "The created event could not be cached.",
      );
    return Response.json(
      {
        event: publicCalendarEvent(
          saved.data as CalendarEventRow,
          context.user.id,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
