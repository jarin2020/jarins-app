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
import {
  deleteProviderEvent,
  updateProviderEvent,
} from "@/lib/calendar-providers";
import { calendarEventInputSchema } from "@/lib/calendar-validation";

async function loadEvent(
  context: Awaited<ReturnType<typeof requireCalendarUser>>,
  eventId: string,
) {
  const result = await context.supabase
    .from("calendar_events")
    .select("*")
    .eq("id", eventId)
    .eq("owner_user_id", context.user.id)
    .single();
  if (result.error || !result.data)
    throw new CalendarHttpError(404, "Calendar event not found.");
  return result.data as CalendarEventRow;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    assertCalendarSameOrigin(request);
    const context = await requireCalendarUser();
    const existing = await loadEvent(context, (await params).eventId);
    const parsed = calendarEventInputSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new CalendarHttpError(
        400,
        parsed.error.issues[0]?.message || "Check the event details.",
      );
    if (parsed.data.sourceId !== existing.source_id)
      throw new CalendarHttpError(
        400,
        "Move between calendars by creating a new event.",
      );
    const sourceResult = await context.supabase
      .from("calendar_sources")
      .select("*")
      .eq("id", existing.source_id)
      .single();
    if (sourceResult.error || !sourceResult.data)
      throw new CalendarHttpError(404, "Calendar source not found.");
    const source = sourceResult.data as CalendarSourceRow;
    const loaded = await loadOwnedCalendarAccount(context, existing.account_id);
    const providerEvent = await updateProviderEvent(
      context,
      loaded.account,
      loaded.credentials,
      source,
      existing,
      parsed.data,
      await ownerDisplayName(context),
    );
    const updated = await context.supabase
      .from("calendar_events")
      .update({
        ...providerEvent,
        household_id: loaded.account.share_with_household
          ? loaded.account.household_id
          : null,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (updated.error || !updated.data)
      throw new CalendarHttpError(500, "Updated event could not be saved.");
    return Response.json({
      event: publicCalendarEvent(
        updated.data as CalendarEventRow,
        context.user.id,
      ),
    });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    assertCalendarSameOrigin(request);
    const context = await requireCalendarUser();
    const existing = await loadEvent(context, (await params).eventId);
    const sourceResult = await context.supabase
      .from("calendar_sources")
      .select("*")
      .eq("id", existing.source_id)
      .single();
    if (sourceResult.error || !sourceResult.data)
      throw new CalendarHttpError(404, "Calendar source not found.");
    const source = sourceResult.data as CalendarSourceRow;
    const loaded = await loadOwnedCalendarAccount(context, existing.account_id);
    await deleteProviderEvent(
      context,
      loaded.account,
      loaded.credentials,
      source,
      existing,
    );
    const deleted = await context.supabase
      .from("calendar_events")
      .delete()
      .eq("id", existing.id);
    if (deleted.error)
      throw new CalendarHttpError(
        500,
        "Deleted event could not be removed locally.",
      );
    return new Response(null, { status: 204 });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
