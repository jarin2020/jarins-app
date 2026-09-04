import {
  errorResponse,
  providerConfiguration,
  publicAccount,
  requireEmailUser,
} from "@/lib/email-server";

export async function GET() {
  try {
    const context = await requireEmailUser();
    const { data, error } = await context.supabase
      .from("email_accounts")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error("Connected email accounts could not be loaded.");
    return Response.json(
      {
        accounts: await Promise.all(
          (data ?? []).map((row) => publicAccount(context.supabase, row)),
        ),
        configuration: providerConfiguration(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
