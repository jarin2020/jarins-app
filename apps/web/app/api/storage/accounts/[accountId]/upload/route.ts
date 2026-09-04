import { uploadProviderFile } from "@/lib/storage-providers";
import {
  assertStorageSameOrigin,
  loadOwnedStorageAccount,
  requireManageAccess,
  requireStorageUser,
  storageErrorResponse,
  StorageHttpError,
} from "@/lib/storage-server";
import { synchronizeStorageAccount } from "@/lib/storage-sync";

const maximumUploadSize = 100 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    assertStorageSameOrigin(request);
    const context = await requireStorageUser();
    const loaded = await loadOwnedStorageAccount(
      context,
      (await params).accountId,
    );
    requireManageAccess(loaded.account);
    const url = new URL(request.url);
    const parentId = url.searchParams.get("parentId");
    const name = url.searchParams.get("name")?.trim();
    const declaredSize = Number(url.searchParams.get("size"));
    const headerSize = Number(
      request.headers.get("content-length") || declaredSize,
    );
    if (!parentId && parentId !== "")
      throw new StorageHttpError(400, "Choose an upload folder.");
    if (!name || name.length > 255 || name.includes("/"))
      throw new StorageHttpError(400, "Enter a valid file name.");
    if (
      !Number.isSafeInteger(declaredSize) ||
      declaredSize < 0 ||
      declaredSize > maximumUploadSize ||
      !Number.isSafeInteger(headerSize) ||
      headerSize !== declaredSize
    ) {
      throw new StorageHttpError(
        413,
        "Uploads are limited to 100 MB per file.",
      );
    }
    let parentPath = "";
    if (parentId !== loaded.account.root_provider_item_id) {
      const parent = await context.supabase
        .from("storage_items")
        .select("path,item_kind")
        .eq("account_id", loaded.account.id)
        .eq("provider_item_id", parentId)
        .single();
      if (parent.error || !parent.data || parent.data.item_kind !== "folder")
        throw new StorageHttpError(404, "Upload folder not found.");
      parentPath = parent.data.path;
    }
    await uploadProviderFile(
      context,
      loaded.account,
      loaded.credentials,
      parentId,
      parentPath,
      name,
      request.headers.get("content-type") || "application/octet-stream",
      declaredSize,
      request.body,
    );
    return Response.json({
      account: await synchronizeStorageAccount(context, loaded.account.id),
    });
  } catch (error) {
    return storageErrorResponse(error);
  }
}
