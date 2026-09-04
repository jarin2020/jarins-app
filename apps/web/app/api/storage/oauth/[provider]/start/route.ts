import { z } from "zod";
import {
  encryptSecret,
  pkceChallenge,
  randomUrlToken,
  sha256Hex,
} from "@/lib/email-security";
import {
  assertStorageSameOrigin,
  dropboxStorageClientId,
  googleStorageClientId,
  microsoftStorageClientId,
  requireStorageUser,
  storageErrorResponse,
  StorageHttpError,
  storageOAuthProvider,
} from "@/lib/storage-server";

const inputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  expectedAddress: z.union([z.literal(""), z.email().max(320)]).optional(),
  accessMode: z.enum(["view", "manage"]),
  includeInSearch: z.boolean(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    assertStorageSameOrigin(request);
    const context = await requireStorageUser();
    const provider = storageOAuthProvider((await params).provider);
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new StorageHttpError(400, "Check the storage connection details.");
    const state = randomUrlToken();
    const verifier = randomUrlToken(64);
    const encrypted = await encryptSecret(verifier);
    await context.supabase
      .from("storage_oauth_states")
      .delete()
      .lt("expires_at", new Date().toISOString());
    const saved = await context.supabase.from("storage_oauth_states").insert({
      state_hash: await sha256Hex(state),
      user_id: context.user.id,
      provider,
      label: parsed.data.label,
      expected_address:
        parsed.data.expectedAddress?.trim().toLowerCase() || null,
      access_mode: parsed.data.accessMode,
      include_in_search: parsed.data.includeInSearch,
      verifier_ciphertext: encrypted.ciphertext,
      verifier_iv: encrypted.iv,
    });
    if (saved.error)
      throw new StorageHttpError(
        500,
        "Secure storage authorization could not start.",
      );

    const origin =
      process.env.STORAGE_OAUTH_REDIRECT_ORIGIN || new URL(request.url).origin;
    const redirectUri = `${origin}/api/storage/oauth/${provider}/callback`;
    const query = new URLSearchParams({
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: "S256",
    });
    if (provider === "google-drive") {
      query.set("client_id", googleStorageClientId());
      query.set(
        "scope",
        [
          "openid",
          "email",
          parsed.data.accessMode === "manage"
            ? "https://www.googleapis.com/auth/drive"
            : "https://www.googleapis.com/auth/drive.readonly",
        ].join(" "),
      );
      query.set("access_type", "offline");
      query.set("prompt", "consent");
      query.set("include_granted_scopes", "true");
      if (parsed.data.expectedAddress)
        query.set("login_hint", parsed.data.expectedAddress);
      return Response.json({
        url: `https://accounts.google.com/o/oauth2/v2/auth?${query}`,
      });
    }
    if (provider === "onedrive") {
      query.set("client_id", microsoftStorageClientId());
      query.set(
        "scope",
        `openid profile email offline_access User.Read ${
          parsed.data.accessMode === "manage" ? "Files.ReadWrite" : "Files.Read"
        }`,
      );
      query.set("response_mode", "query");
      if (parsed.data.expectedAddress)
        query.set("login_hint", parsed.data.expectedAddress);
      return Response.json({
        url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${query}`,
      });
    }
    query.set("client_id", dropboxStorageClientId());
    query.set("token_access_type", "offline");
    query.set(
      "scope",
      [
        "account_info.read",
        "files.metadata.read",
        "files.content.read",
        ...(parsed.data.accessMode === "manage"
          ? ["files.metadata.write", "files.content.write"]
          : []),
      ].join(" "),
    );
    return Response.json({
      url: `https://www.dropbox.com/oauth2/authorize?${query}`,
    });
  } catch (error) {
    return storageErrorResponse(error);
  }
}
