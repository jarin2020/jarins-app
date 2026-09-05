import { z } from "zod";
import {
  assertCalendarSameOrigin,
  calendarErrorResponse,
  CalendarHttpError,
  loadOwnedCalendarAccount,
  publicCalendarAccount,
  requireCalendarUser,
} from "@/lib/calendar-server";
import { providerFetch } from "@/lib/provider-http";

const patchSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  syncMode: z.enum(["two-way", "read-only"]).optional(),
  included: z.boolean().optional(),
  shareWithHousehold: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    assertCalendarSameOrigin(request);
    const context = await requireCalendarUser();
    const { accountId } = await params;
    const loaded = await loadOwnedCalendarAccount(context, accountId);
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new CalendarHttpError(400, "Check the calendar settings.");
    const input = parsed.data;
    if (
      input.syncMode === "two-way" &&
      loaded.credentials.kind === "oauth" &&
      !loaded.credentials.scope.toLowerCase().includes("readwrite") &&
      !loaded.credentials.scope
        .split(/\s+/)
        .includes("https://www.googleapis.com/auth/calendar")
    ) {
      throw new CalendarHttpError(
        409,
        "Reconnect this account to grant two-way calendar access.",
      );
    }
    const changes: Record<string, unknown> = {};
    if (input.label !== undefined) changes.label = input.label;
    if (input.syncMode !== undefined) changes.sync_mode = input.syncMode;
    if (input.included !== undefined) changes.included = input.included;
    if (input.shareWithHousehold !== undefined)
      changes.share_with_household = input.shareWithHousehold;
    const result = await context.supabase
      .from("calendar_accounts")
      .update(changes)
      .eq("id", accountId)
      .select("*")
      .single();
    if (result.error || !result.data)
      throw new CalendarHttpError(500, "Calendar settings could not be saved.");
    if (input.shareWithHousehold !== undefined) {
      const selectedSources = await context.supabase
        .from("calendar_sources")
        .select("id")
        .eq("account_id", accountId)
        .eq("selected", true);
      const sourceIds = (selectedSources.data ?? []).map((source) => source.id);
      if (sourceIds.length) {
        await context.supabase
          .from("calendar_events")
          .update({
            household_id: input.shareWithHousehold
              ? result.data.household_id
              : null,
          })
          .eq("account_id", accountId)
          .in("source_id", sourceIds);
      }
    }
    return Response.json({
      account: await publicCalendarAccount(context.supabase, result.data),
    });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    assertCalendarSameOrigin(request);
    const context = await requireCalendarUser();
    const { accountId } = await params;
    const loaded = await loadOwnedCalendarAccount(context, accountId);
    if (
      loaded.account.provider === "google" &&
      loaded.credentials.kind === "oauth"
    ) {
      await providerFetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(loaded.credentials.refreshToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      ).catch(() => undefined);
    }
    const result = await context.supabase
      .from("calendar_accounts")
      .delete()
      .eq("id", accountId);
    if (result.error)
      throw new CalendarHttpError(500, "Calendar could not be disconnected.");
    return new Response(null, { status: 204 });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
