import {
  assertStorageSameOrigin,
  requireStorageUser,
  storageErrorResponse,
} from "@/lib/storage-server";
import { synchronizeStorageAccount } from "@/lib/storage-sync";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    assertStorageSameOrigin(request);
    const context = await requireStorageUser();
    return Response.json({
      account: await synchronizeStorageAccount(
        context,
        (await params).accountId,
      ),
    });
  } catch (error) {
    return storageErrorResponse(error);
  }
}
