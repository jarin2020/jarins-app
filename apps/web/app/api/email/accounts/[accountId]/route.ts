import {
  assertSameOrigin,
  errorResponse,
  loadOwnedAccount,
  requireEmailUser,
} from "@/lib/email-server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await requireEmailUser();
    const { accountId } = await params;
    const { account, credentials } = await loadOwnedAccount(context, accountId);
    if (account.provider === "gmail" && credentials.kind === "oauth") {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(credentials.refreshToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      ).catch(() => undefined);
    }
    const { error } = await context.supabase
      .from("email_accounts")
      .delete()
      .eq("id", accountId);
    if (error) throw new Error("The mailbox could not be disconnected.");
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
