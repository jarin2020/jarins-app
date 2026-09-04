import { z } from "zod";
import { encodedAttachmentsBytes, type EmailComposeInput } from "@/lib/email";
import { sendProviderMessage } from "@/lib/email-providers";
import {
  assertSameOrigin,
  EmailHttpError,
  errorResponse,
  loadOwnedAccount,
  requireEmailUser,
} from "@/lib/email-server";

const address = z.email().max(320);
const composeSchema = z.object({
  to: z.array(address).min(1).max(50),
  cc: z.array(address).max(50).optional(),
  subject: z.string().max(998),
  text: z.string().min(1).max(500_000),
  replyToProviderMessageId: z.string().max(1000).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        contentType: z.string().min(1).max(200),
        contentBase64: z.string().max(14_000_000),
      }),
    )
    .max(10)
    .optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await requireEmailUser();
    const { accountId } = await params;
    const parsed = composeSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new EmailHttpError(400, "Check the recipients and message.");
    const totalBytes = encodedAttachmentsBytes(parsed.data.attachments ?? []);
    if (totalBytes > 10 * 1024 * 1024) {
      throw new EmailHttpError(
        413,
        "Attachments are limited to 10 MB per message.",
      );
    }
    const loaded = await loadOwnedAccount(context, accountId);
    const rateLimit = await context.supabase.rpc("claim_email_send_slot", {
      target_account: accountId,
    });
    if (rateLimit.error) {
      throw new EmailHttpError(
        429,
        "Email send limit reached. Try again later.",
      );
    }
    await sendProviderMessage(
      context,
      loaded.account,
      loaded.credentials,
      parsed.data as EmailComposeInput,
    );
    return Response.json({ sent: true });
  } catch (error) {
    return errorResponse(error);
  }
}
