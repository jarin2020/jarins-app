import { z } from "zod";
import { secureWebDavUrl } from "@/lib/storage-providers";
import {
  assertStorageSameOrigin,
  publicStorageAccount,
  requireStorageUser,
  saveStorageCredentials,
  storageErrorResponse,
  StorageHttpError,
  type WebDavCredentials,
} from "@/lib/storage-server";
import { synchronizeStorageAccount } from "@/lib/storage-sync";

const inputSchema = z.object({
  address: z.string().trim().min(1).max(320),
  label: z.string().trim().min(1).max(80),
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(2048),
  serverUrl: z.url().max(2048),
  accessMode: z.enum(["view", "manage"]),
  includeInSearch: z.boolean(),
});

export async function POST(request: Request) {
  try {
    assertStorageSameOrigin(request);
    const context = await requireStorageUser();
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new StorageHttpError(400, "Check the WebDAV connection details.");
    const serverUrl = secureWebDavUrl(parsed.data.serverUrl);
    if (!serverUrl.pathname.endsWith("/")) serverUrl.pathname += "/";
    const credentials: WebDavCredentials = {
      kind: "webdav",
      username: parsed.data.username,
      password: parsed.data.password,
      serverUrl: serverUrl.href,
    };
    const accountResult = await context.supabase
      .from("storage_accounts")
      .upsert(
        {
          user_id: context.user.id,
          provider: "webdav",
          address: parsed.data.address,
          label: parsed.data.label,
          status: "connecting",
          access_mode: parsed.data.accessMode,
          include_in_search: parsed.data.includeInSearch,
          provider_account_id: `${serverUrl.hostname}:${parsed.data.username}`,
          root_provider_item_id: serverUrl.href,
          connection_config: { serverOrigin: serverUrl.origin },
          last_error: null,
        },
        { onConflict: "user_id,provider,address" },
      )
      .select("*")
      .single();
    if (accountResult.error || !accountResult.data)
      throw new StorageHttpError(500, "The WebDAV account could not be saved.");
    await saveStorageCredentials(context, accountResult.data.id, credentials);
    const account = await synchronizeStorageAccount(
      context,
      accountResult.data.id,
    );
    return Response.json({
      account:
        account ||
        (await publicStorageAccount(context.supabase, accountResult.data)),
    });
  } catch (error) {
    return storageErrorResponse(error);
  }
}
