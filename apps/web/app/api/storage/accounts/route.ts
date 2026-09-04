import {
  publicStorageAccount,
  requireStorageUser,
  storageErrorResponse,
  storageProviderConfiguration,
} from "@/lib/storage-server";

export async function GET() {
  try {
    const context = await requireStorageUser();
    const result = await context.supabase
      .from("storage_accounts")
      .select("*")
      .order("updated_at", { ascending: false });
    if (result.error) throw new Error("Connected storage could not be loaded.");
    return Response.json(
      {
        accounts: await Promise.all(
          (result.data ?? []).map((row) =>
            publicStorageAccount(context.supabase, row),
          ),
        ),
        configuration: storageProviderConfiguration(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return storageErrorResponse(error);
  }
}
