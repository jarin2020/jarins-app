import { downloadProviderAttachment } from "@/lib/email-providers";
import {
  EmailHttpError,
  errorResponse,
  loadOwnedAccount,
  requireEmailUser,
} from "@/lib/email-server";

function safeFilename(value: string) {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 200) || "attachment";
}

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      accountId: string;
      messageId: string;
      attachmentId: string;
    }>;
  },
) {
  try {
    const context = await requireEmailUser();
    const { accountId, messageId, attachmentId } = await params;
    const loaded = await loadOwnedAccount(context, accountId);
    const cached = await context.supabase
      .from("email_messages")
      .select("id")
      .eq("account_id", accountId)
      .eq("provider_message_id", messageId)
      .single();
    if (cached.error) throw new EmailHttpError(404, "Message not found.");
    const attachment = await downloadProviderAttachment(
      context,
      loaded.account,
      loaded.credentials,
      messageId,
      attachmentId,
    );
    if (!attachment.content)
      throw new EmailHttpError(404, "Attachment not found.");
    return new Response(attachment.content as BodyInit, {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Length": String(attachment.content.byteLength),
        "Content-Disposition": `attachment; filename="${safeFilename(attachment.name)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
