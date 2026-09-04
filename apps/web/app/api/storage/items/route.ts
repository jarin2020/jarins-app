import { z } from "zod";
import { createProviderFolder } from "@/lib/storage-providers";
import {
  assertStorageSameOrigin,
  loadOwnedStorageAccount,
  publicStorageItem,
  requireManageAccess,
  requireStorageUser,
  storageErrorResponse,
  StorageHttpError,
  type StorageItemRow,
} from "@/lib/storage-server";
import { synchronizeStorageAccount } from "@/lib/storage-sync";

const folderSchema = z.object({
  accountId: z.uuid(),
  parentProviderItemId: z.string().max(8192),
  name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((name) => !name.includes("/")),
});

function filterKind(items: StorageItemRow[], kind: string | null) {
  if (kind === "images")
    return items.filter((item) => item.mime_type?.startsWith("image/"));
  if (kind === "documents")
    return items.filter(
      (item) =>
        item.item_kind === "file" && !item.mime_type?.startsWith("image/"),
    );
  return items;
}

export async function GET(request: Request) {
  try {
    const context = await requireStorageUser();
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId");
    const query = url.searchParams.get("query")?.trim().slice(0, 160) || "";
    const kind = url.searchParams.get("kind");
    const hasParent = url.searchParams.has("parentId");
    const parentId = url.searchParams.get("parentId") || "";

    let rows: StorageItemRow[] = [];
    if (query) {
      let accountIds: string[];
      if (accountId) {
        const loaded = await loadOwnedStorageAccount(context, accountId);
        accountIds = [loaded.account.id];
      } else {
        const accounts = await context.supabase
          .from("storage_accounts")
          .select("id")
          .eq("include_in_search", true)
          .eq("status", "active");
        if (accounts.error)
          throw new StorageHttpError(
            500,
            "Storage accounts could not be searched.",
          );
        accountIds = (accounts.data ?? []).map((account) => account.id);
      }
      if (accountIds.length) {
        const result = await context.supabase
          .from("storage_items")
          .select("*")
          .in("account_id", accountIds)
          .textSearch("search_vector", query, {
            config: "simple",
            type: "websearch",
          })
          .order("modified_at", { ascending: false, nullsFirst: false })
          .limit(500);
        if (result.error)
          throw new StorageHttpError(500, "Files could not be searched.");
        rows = (result.data ?? []) as StorageItemRow[];
      }
    } else if (accountId) {
      const loaded = await loadOwnedStorageAccount(context, accountId);
      const targetParent = hasParent
        ? parentId
        : loaded.account.root_provider_item_id;
      const result = await context.supabase
        .from("storage_items")
        .select("*")
        .eq("account_id", accountId)
        .eq("parent_provider_item_id", targetParent)
        .order("item_kind", { ascending: false })
        .order("name")
        .limit(500);
      if (result.error)
        throw new StorageHttpError(500, "Folder contents could not be loaded.");
      rows = (result.data ?? []) as StorageItemRow[];
    } else {
      const accounts = await context.supabase
        .from("storage_accounts")
        .select("id,root_provider_item_id")
        .eq("status", "active");
      if (accounts.error)
        throw new StorageHttpError(
          500,
          "Storage accounts could not be loaded.",
        );
      const results = await Promise.all(
        (accounts.data ?? []).map((account) =>
          context.supabase
            .from("storage_items")
            .select("*")
            .eq("account_id", account.id)
            .eq("parent_provider_item_id", account.root_provider_item_id)
            .order("item_kind", { ascending: false })
            .order("name")
            .limit(100),
        ),
      );
      if (results.some((result) => result.error))
        throw new StorageHttpError(
          500,
          "Storage contents could not be loaded.",
        );
      rows = results.flatMap((result) => result.data ?? []) as StorageItemRow[];
    }
    return Response.json(
      { items: filterKind(rows, kind).map(publicStorageItem) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return storageErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertStorageSameOrigin(request);
    const context = await requireStorageUser();
    const parsed = folderSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new StorageHttpError(400, "Check the new folder details.");
    const loaded = await loadOwnedStorageAccount(
      context,
      parsed.data.accountId,
    );
    requireManageAccess(loaded.account);
    let parentPath = "";
    if (
      parsed.data.parentProviderItemId !== loaded.account.root_provider_item_id
    ) {
      const parent = await context.supabase
        .from("storage_items")
        .select("path,item_kind")
        .eq("account_id", loaded.account.id)
        .eq("provider_item_id", parsed.data.parentProviderItemId)
        .single();
      if (parent.error || !parent.data || parent.data.item_kind !== "folder")
        throw new StorageHttpError(404, "Parent folder not found.");
      parentPath = parent.data.path;
    }
    await createProviderFolder(
      context,
      loaded.account,
      loaded.credentials,
      parsed.data.parentProviderItemId,
      parentPath,
      parsed.data.name,
    );
    return Response.json({
      account: await synchronizeStorageAccount(context, loaded.account.id),
    });
  } catch (error) {
    return storageErrorResponse(error);
  }
}
