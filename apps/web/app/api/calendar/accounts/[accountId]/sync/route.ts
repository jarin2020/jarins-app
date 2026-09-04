import {
  assertCalendarSameOrigin,
  calendarErrorResponse,
  CalendarHttpError,
  loadOwnedCalendarAccount,
  markCalendarAccountError,
  ownerDisplayName,
  publicCalendarAccount,
  requireCalendarUser,
  type CalendarSourceRow,
} from "@/lib/calendar-server";
import {
  discoverAccountCalendars,
  syncCalendarSource,
  upsertDiscoveredSources,
} from "@/lib/calendar-providers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  let context: Awaited<ReturnType<typeof requireCalendarUser>> | null = null;
  let accountId = "";
  try {
    assertCalendarSameOrigin(request);
    context = await requireCalendarUser();
    accountId = (await params).accountId;
    let loaded = await loadOwnedCalendarAccount(context, accountId);
    await context.supabase
      .from("calendar_accounts")
      .update({ status: "syncing", last_error: null })
      .eq("id", accountId);

    await upsertDiscoveredSources(
      context,
      accountId,
      await discoverAccountCalendars(
        context,
        loaded.account,
        loaded.credentials,
      ),
    );
    loaded = await loadOwnedCalendarAccount(context, accountId);
    const sourceResult = await context.supabase
      .from("calendar_sources")
      .select("*")
      .eq("account_id", accountId)
      .eq("selected", true);
    if (sourceResult.error)
      throw new CalendarHttpError(500, "Calendar sources could not be loaded.");
    const displayName = await ownerDisplayName(context);
    for (const rawSource of sourceResult.data ?? []) {
      const source = rawSource as CalendarSourceRow;
      const result = await syncCalendarSource(
        context,
        loaded.account,
        loaded.credentials,
        source,
        displayName,
      );
      if (result.events.length) {
        const rows = result.events.map((event) => ({
          ...event,
          source_id: source.id,
          account_id: accountId,
          owner_user_id: context!.user.id,
          household_id: loaded.account.share_with_household
            ? loaded.account.household_id
            : null,
        }));
        const upsert = await context.supabase
          .from("calendar_events")
          .upsert(rows, { onConflict: "source_id,provider_event_id" });
        if (upsert.error)
          throw new CalendarHttpError(
            500,
            "Synchronized events could not be saved.",
          );
      }
      if (result.removedIds.length) {
        await context.supabase
          .from("calendar_events")
          .delete()
          .eq("source_id", source.id)
          .in("provider_event_id", result.removedIds);
      }
      if (!result.incremental) {
        const currentIds = new Set(
          result.events.map((event) => event.provider_event_id),
        );
        const existing = await context.supabase
          .from("calendar_events")
          .select("provider_event_id")
          .eq("source_id", source.id);
        const staleIds = (existing.data ?? [])
          .map((event) => event.provider_event_id as string)
          .filter((id) => !currentIds.has(id));
        for (let index = 0; index < staleIds.length; index += 100) {
          await context.supabase
            .from("calendar_events")
            .delete()
            .eq("source_id", source.id)
            .in("provider_event_id", staleIds.slice(index, index + 100));
        }
      }
      await context.supabase
        .from("calendar_sources")
        .update({ sync_cursor: result.cursor })
        .eq("id", source.id);
    }
    const updated = await context.supabase
      .from("calendar_accounts")
      .update({
        status: "active",
        last_error: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", accountId)
      .select("*")
      .single();
    if (updated.error || !updated.data)
      throw new CalendarHttpError(
        500,
        "Calendar sync status could not be saved.",
      );
    return Response.json({
      account: await publicCalendarAccount(context.supabase, updated.data),
    });
  } catch (error) {
    if (context && accountId)
      await markCalendarAccountError(context, accountId, error);
    return calendarErrorResponse(error);
  }
}
