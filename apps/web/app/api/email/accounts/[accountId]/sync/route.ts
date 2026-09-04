import {
  assertSameOrigin,
  errorResponse,
  loadOwnedAccount,
  markAccountError,
  publicAccount,
  requireEmailUser,
} from "@/lib/email-server";
import { syncProvider } from "@/lib/email-providers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return errorResponse(error);
  }
  const context = await requireEmailUser().catch(() => null);
  if (!context)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  const { accountId } = await params;
  try {
    const loaded = await loadOwnedAccount(context, accountId);
    await context.supabase
      .from("email_accounts")
      .update({ status: "syncing", last_error: null })
      .eq("id", accountId);
    const result = await syncProvider(
      context,
      loaded.account,
      loaded.credentials,
    );
    if (result.messages.length) {
      const upsert = await context.supabase
        .from("email_messages")
        .upsert(result.messages, {
          onConflict: "account_id,provider_message_id",
        });
      if (upsert.error)
        throw new Error("Synchronized messages could not be saved.");
    }
    const existing = await context.supabase
      .from("email_messages")
      .select("provider_message_id")
      .eq("account_id", accountId);
    const currentIds = new Set(
      result.messages.map((message) => message.provider_message_id),
    );
    const staleIds = (existing.data ?? [])
      .map((message) => message.provider_message_id as string)
      .filter((id) => !currentIds.has(id));
    for (let index = 0; index < staleIds.length; index += 100) {
      await context.supabase
        .from("email_messages")
        .delete()
        .eq("account_id", accountId)
        .in("provider_message_id", staleIds.slice(index, index + 100));
    }
    const updated = await context.supabase
      .from("email_accounts")
      .update({
        status: "active",
        last_error: null,
        last_synced_at: new Date().toISOString(),
        sync_cursor: result.cursor ?? loaded.account.sync_cursor,
      })
      .eq("id", accountId)
      .select("*")
      .single();
    if (updated.error || !updated.data)
      throw new Error("Mailbox status could not be saved.");
    return Response.json({
      account: await publicAccount(context.supabase, updated.data),
    });
  } catch (error) {
    await markAccountError(context, accountId, error);
    return errorResponse(error);
  }
}
