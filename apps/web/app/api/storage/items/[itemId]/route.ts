import { z } from "zod";
import {
  deleteProviderItem,
  renameProviderItem,
} from "@/lib/storage-providers";
import {
  assertStorageSameOrigin,
  loadOwnedStorageItem,
  requireManageAccess,
  requireStorageUser,
  storageErrorResponse,
  StorageHttpError,
} from "@/lib/storage-server";
import { synchronizeStorageAccount } from "@/lib/storage-sync";

const renameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((name) => !name.includes("/")),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    assertStorageSameOrigin(request);
    const context = await requireStorageUser();
    const loaded = await loadOwnedStorageItem(context, (await params).itemId);
    requireManageAccess(loaded.account);
    if (!loaded.item.can_edit)
      throw new StorageHttpError(403, "The provider made this item read-only.");
    const parsed = renameSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new StorageHttpError(400, "Enter a valid file or folder name.");
    await renameProviderItem(
      context,
      loaded.account,
      loaded.credentials,
      loaded.item,
      parsed.data.name,
    );
    await synchronizeStorageAccount(context, loaded.account.id);
    return Response.json({ ok: true });
  } catch (error) {
    return storageErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    assertStorageSameOrigin(request);
    const context = await requireStorageUser();
    const loaded = await loadOwnedStorageItem(context, (await params).itemId);
    requireManageAccess(loaded.account);
    if (!loaded.item.can_edit)
      throw new StorageHttpError(403, "The provider made this item read-only.");
    await deleteProviderItem(
      context,
      loaded.account,
      loaded.credentials,
      loaded.item,
    );
    await synchronizeStorageAccount(context, loaded.account.id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return storageErrorResponse(error);
  }
}
