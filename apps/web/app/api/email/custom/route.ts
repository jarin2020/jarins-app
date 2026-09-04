import { z } from "zod";
import type { CustomCredentials } from "@/lib/email-server";
import {
  assertSameOrigin,
  EmailHttpError,
  errorResponse,
  publicAccount,
  requireEmailUser,
  saveCredentials,
} from "@/lib/email-server";
import { verifyCustomConnection } from "@/lib/email-providers";

const customAccountSchema = z.object({
  address: z
    .email()
    .max(320)
    .transform((value) => value.trim().toLowerCase()),
  label: z.string().trim().min(1).max(80),
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(500),
  imapHost: z.string().trim().min(1).max(255),
  imapPort: z.number().int().min(1).max(65535),
  imapSecure: z.boolean(),
  smtpHost: z.string().trim().min(1).max(255),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireEmailUser();
    const parsed = customAccountSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new EmailHttpError(400, "Check the custom mail settings.");
    const input = parsed.data;
    const credentials: CustomCredentials = {
      kind: "password",
      username: input.username,
      password: input.password,
      imap: {
        host: input.imapHost,
        port: input.imapPort,
        secure: input.imapSecure,
      },
      smtp: {
        host: input.smtpHost,
        port: input.smtpPort,
        secure: input.smtpSecure,
      },
    };
    try {
      await verifyCustomConnection(credentials);
    } catch {
      throw new EmailHttpError(
        502,
        "Could not sign in to both IMAP and SMTP. Check the hosts, ports, TLS mode, and app password.",
      );
    }
    const accountResult = await context.supabase
      .from("email_accounts")
      .upsert(
        {
          user_id: context.user.id,
          provider: "custom",
          address: input.address,
          label: input.label,
          status: "active",
          provider_account_id: input.username,
          connection_config: {
            imapHost: input.imapHost,
            imapPort: input.imapPort,
            imapSecure: input.imapSecure,
            smtpHost: input.smtpHost,
            smtpPort: input.smtpPort,
            smtpSecure: input.smtpSecure,
          },
          last_error: null,
        },
        { onConflict: "user_id,provider,address" },
      )
      .select("*")
      .single();
    if (accountResult.error || !accountResult.data) {
      throw new EmailHttpError(500, "The custom mailbox could not be saved.");
    }
    await saveCredentials(context, accountResult.data.id, credentials);
    return Response.json(
      { account: await publicAccount(context.supabase, accountResult.data) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
