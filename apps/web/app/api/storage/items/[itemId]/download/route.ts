import { downloadProviderFile } from "@/lib/storage-providers";
import {
  loadOwnedStorageItem,
  requireStorageUser,
  storageErrorResponse,
  StorageHttpError,
} from "@/lib/storage-server";

function attachmentDisposition(name: string) {
  const ascii = name
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\\r\n]/g, "_")
    .slice(0, 180);
  return `attachment; filename="${ascii || "download"}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const context = await requireStorageUser();
    const loaded = await loadOwnedStorageItem(context, (await params).itemId);
    if (loaded.item.item_kind !== "file" || !loaded.item.can_download)
      throw new StorageHttpError(409, "This item cannot be downloaded.");
    const result = await downloadProviderFile(
      context,
      loaded.account,
      loaded.credentials,
      loaded.item,
    );
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Disposition": attachmentDisposition(result.name),
      "Content-Type":
        result.response.headers.get("content-type") || result.mimeType,
      "X-Content-Type-Options": "nosniff",
    });
    const length = result.response.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    return new Response(result.response.body, { status: 200, headers });
  } catch (error) {
    return storageErrorResponse(error);
  }
}
