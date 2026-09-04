import {
  errorResponse,
  loadOwnedAccount,
  requireEmailUser,
} from "@/lib/email-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const context = await requireEmailUser();
    const { accountId } = await params;
    await loadOwnedAccount(context, accountId);
    const { data, error } = await context.supabase
      .from("email_messages")
      .select("*")
      .eq("account_id", accountId)
      .order("received_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Messages could not be loaded.");
    return Response.json(
      {
        messages: (data ?? []).map((message) => ({
          id: message.id,
          providerMessageId: message.provider_message_id,
          providerThreadId: message.provider_thread_id,
          subject: message.subject,
          senderName: message.sender_name,
          senderAddress: message.sender_address,
          recipients: message.recipients,
          receivedAt: message.received_at,
          snippet: message.snippet,
          isRead: message.is_read,
          isStarred: message.is_starred,
          hasAttachments: message.has_attachments,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
