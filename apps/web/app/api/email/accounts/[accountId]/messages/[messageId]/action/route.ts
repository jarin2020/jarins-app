import { z } from "zod";
import {
  assertSameOrigin,
  EmailHttpError,
  errorResponse,
  loadOwnedAccount,
  requireEmailUser,
} from "@/lib/email-server";
import { applyProviderAction } from "@/lib/email-providers";

const actionSchema = z.object({
  action: z.enum(["read", "unread", "star", "unstar", "archive"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string; messageId: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await requireEmailUser();
    const { accountId, messageId } = await params;
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new EmailHttpError(400, "Unknown message action.");
    const loaded = await loadOwnedAccount(context, accountId);
    const cached = await context.supabase
      .from("email_messages")
      .select("id")
      .eq("account_id", accountId)
      .eq("provider_message_id", messageId)
      .single();
    if (cached.error || !cached.data)
      throw new EmailHttpError(404, "Message not found.");
    await applyProviderAction(
      context,
      loaded.account,
      loaded.credentials,
      messageId,
      parsed.data.action,
    );
    if (parsed.data.action === "archive") {
      await context.supabase
        .from("email_messages")
        .delete()
        .eq("id", cached.data.id);
    } else {
      const update =
        parsed.data.action === "read" || parsed.data.action === "unread"
          ? { is_read: parsed.data.action === "read" }
          : { is_starred: parsed.data.action === "star" };
      await context.supabase
        .from("email_messages")
        .update(update)
        .eq("id", cached.data.id);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
