import { z } from "zod";
import {
  assertStorageSameOrigin,
  loadOwnedStorageAccount,
  publicStorageAccount,
  requireStorageUser,
  storageErrorResponse,
  StorageHttpError,
} from "@/lib/storage-server";
import { providerFetch } from "@/lib/provider-http";

const patchSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  accessMode: z.enum(["view", "manage"]).optional(),
  includeInSearch: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    assertStorageSameOrigin(request);
    const context = await requireStorageUser();
    const { accountId } = await params;
    const loaded = await loadOwnedStorageAccount(context, accountId);
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new StorageHttpError(400, "Check the storage settings.");
    if (
      parsed.data.accessMode === "manage" &&
      loaded.credentials.kind === "oauth" &&
      !loaded.credentials.scope.toLowerCase().includes("write") &&
      !loaded.credentials.scope
        .split(/\s+/)
        .includes("https://www.googleapis.com/auth/drive")
    ) {
      throw new StorageHttpError(
        409,
        "Reconnect this account to grant file management access.",
      );
    }
    const changes: Record<string, unknown> = {};
    if (parsed.data.label !== undefined) changes.label = parsed.data.label;
    if (parsed.data.accessMode !== undefined)
      changes.access_mode = parsed.data.accessMode;
    if (parsed.data.includeInSearch !== undefined)
      changes.include_in_search = parsed.data.includeInSearch;
    const result = await context.supabase
      .from("storage_accounts")
      .update(changes)
      .eq("id", accountId)
      .select("*")
      .single();
    if (result.error || !result.data)
      throw new StorageHttpError(500, "Storage settings could not be saved.");
    return Response.json({
      account: await publicStorageAccount(context.supabase, result.data),
    });
  } catch (error) {
    return storageErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    assertStorageSameOrigin(request);
    const context = await requireStorageUser();
    const { accountId } = await params;
    const loaded = await loadOwnedStorageAccount(context, accountId);
    if (
      loaded.account.provider === "google-drive" &&
      loaded.credentials.kind === "oauth"
    ) {
      await providerFetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(loaded.credentials.refreshToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      ).catch(() => undefined);
    }
    const result = await context.supabase
      .from("storage_accounts")
      .delete()
      .eq("id", accountId);
    if (result.error)
      throw new StorageHttpError(500, "Storage could not be disconnected.");
    return new Response(null, { status: 204 });
  } catch (error) {
    return storageErrorResponse(error);
  }
}
