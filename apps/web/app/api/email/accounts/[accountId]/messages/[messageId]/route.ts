import {
  errorResponse,
  loadOwnedAccount,
  requireEmailUser,
} from "@/lib/email-server";
import { getProviderMessage } from "@/lib/email-providers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accountId: string; messageId: string }> },
) {
  try {
    const context = await requireEmailUser();
    const { accountId, messageId } = await params;
    const loaded = await loadOwnedAccount(context, accountId);
    const cached = await context.supabase
      .from("email_messages")
      .select("id")
      .eq("account_id", accountId)
      .eq("provider_message_id", messageId)
      .single();
    if (cached.error || !cached.data) {
      return Response.json({ error: "Message not found." }, { status: 404 });
    }
    const message = await getProviderMessage(
      context,
      loaded.account,
      loaded.credentials,
      messageId,
    );
    return Response.json(
      { message },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
