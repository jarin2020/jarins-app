import { z } from "zod";
import {
  assertCalendarSameOrigin,
  calendarErrorResponse,
  CalendarHttpError,
  loadOwnedCalendarAccount,
  publicCalendarAccount,
  requireCalendarUser,
} from "@/lib/calendar-server";

const inputSchema = z.object({ selected: z.boolean() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string; sourceId: string }> },
) {
  try {
    assertCalendarSameOrigin(request);
    const context = await requireCalendarUser();
    const { accountId, sourceId } = await params;
    const { account } = await loadOwnedCalendarAccount(context, accountId);
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new CalendarHttpError(400, "Check the calendar selection.");
    const source = await context.supabase
      .from("calendar_sources")
      .update({ selected: parsed.data.selected })
      .eq("id", sourceId)
      .eq("account_id", accountId)
      .select("id")
      .single();
    if (source.error || !source.data)
      throw new CalendarHttpError(404, "Calendar source not found.");
    await context.supabase
      .from("calendar_events")
      .update({
        household_id:
          parsed.data.selected && account.share_with_household
            ? account.household_id
            : null,
      })
      .eq("source_id", sourceId);
    const refreshed = await context.supabase
      .from("calendar_accounts")
      .select("*")
      .eq("id", accountId)
      .single();
    return Response.json({
      account: await publicCalendarAccount(context.supabase, refreshed.data),
    });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
