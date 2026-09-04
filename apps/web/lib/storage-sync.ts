import "server-only";

import { syncStorageProvider } from "@/lib/storage-providers";
import {
  loadOwnedStorageAccount,
  markStorageAccountError,
  publicStorageAccount,
  StorageHttpError,
  type StorageRequestContext,
} from "@/lib/storage-server";

export async function synchronizeStorageAccount(
  context: StorageRequestContext,
  accountId: string,
) {
  await context.supabase
    .from("storage_accounts")
    .update({ status: "syncing", last_error: null })
    .eq("id", accountId);
  try {
    const loaded = await loadOwnedStorageAccount(context, accountId);
    const result = await syncStorageProvider(
      context,
      loaded.account,
      loaded.credentials,
    );
    // Providers can surface the same item through multiple collections (for
    // example, a Google shared item and its shared-drive corpus). PostgreSQL
    // rejects duplicate conflict keys within one upsert statement, so collapse
    // those aliases before persisting the index.
    const uniqueItems = [
      ...new Map(
        result.items.map((item) => [item.provider_item_id, item]),
      ).values(),
    ];
    const rows = uniqueItems.map((item) => ({
      ...item,
      account_id: accountId,
      user_id: context.user.id,
    }));
    for (let index = 0; index < rows.length; index += 200) {
      const upsert = await context.supabase
        .from("storage_items")
        .upsert(rows.slice(index, index + 200), {
          onConflict: "account_id,provider_item_id",
        });
      if (upsert.error)
        throw new StorageHttpError(
          500,
          "Synchronized file metadata could not be saved.",
        );
    }

    const currentIds = new Set(
      uniqueItems.map((item) => item.provider_item_id),
    );
    const existing = await context.supabase
      .from("storage_items")
      .select("provider_item_id")
      .eq("account_id", accountId);
    if (existing.error)
      throw new StorageHttpError(
        500,
        "Existing file metadata could not be checked.",
      );
    const staleIds = (existing.data ?? [])
      .map((item) => item.provider_item_id as string)
      .filter((id) => !currentIds.has(id));
    for (let index = 0; index < staleIds.length; index += 100) {
      const deletion = await context.supabase
        .from("storage_items")
        .delete()
        .eq("account_id", accountId)
        .in("provider_item_id", staleIds.slice(index, index + 100));
      if (deletion.error)
        throw new StorageHttpError(
          500,
          "Stale file metadata could not be removed.",
        );
    }

    const updated = await context.supabase
      .from("storage_accounts")
      .update({
        status: "active",
        root_provider_item_id: result.rootProviderItemId,
        sync_cursor: result.cursor,
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", accountId)
      .select("*")
      .single();
    if (updated.error || !updated.data)
      throw new StorageHttpError(
        500,
        "Storage sync status could not be saved.",
      );
    return publicStorageAccount(context.supabase, updated.data);
  } catch (error) {
    await markStorageAccountError(context, accountId, error);
    throw error;
  }
}
