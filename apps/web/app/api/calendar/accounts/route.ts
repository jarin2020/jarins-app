import {
  calendarErrorResponse,
  calendarProviderConfiguration,
  publicCalendarAccount,
  requireCalendarUser,
} from "@/lib/calendar-server";

export async function GET() {
  try {
    const context = await requireCalendarUser();
    const { data, error } = await context.supabase
      .from("calendar_accounts")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error)
      throw new Error("Connected calendar accounts could not be loaded.");
    return Response.json(
      {
        accounts: await Promise.all(
          (data ?? []).map((row) =>
            publicCalendarAccount(context.supabase, row),
          ),
        ),
        configuration: calendarProviderConfiguration(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
