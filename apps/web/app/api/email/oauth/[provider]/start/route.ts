import { z } from "zod";
import type { EmailProvider } from "@/lib/email";
import {
  encryptSecret,
  pkceChallenge,
  randomUrlToken,
  sha256Hex,
} from "@/lib/email-security";
import {
  assertSameOrigin,
  EmailHttpError,
  errorResponse,
  requireEmailUser,
} from "@/lib/email-server";

const inputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  expectedAddress: z.union([z.literal(""), z.email().max(320)]).optional(),
});

function oauthProvider(value: string): EmailProvider {
  if (value === "gmail" || value === "outlook") return value;
  throw new EmailHttpError(404, "Unknown email provider.");
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new EmailHttpError(503, `${name} is not configured.`);
  return value;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await requireEmailUser();
    const provider = oauthProvider((await params).provider);
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new EmailHttpError(400, "Enter a valid mailbox label.");
    const state = randomUrlToken();
    const verifier = randomUrlToken(64);
    const encryptedVerifier = await encryptSecret(verifier);
    await context.supabase
      .from("email_oauth_states")
      .delete()
      .lt("expires_at", new Date().toISOString());
    const { error } = await context.supabase.from("email_oauth_states").insert({
      state_hash: await sha256Hex(state),
      user_id: context.user.id,
      provider,
      label: parsed.data.label,
      expected_address:
        parsed.data.expectedAddress?.trim().toLowerCase() || null,
      verifier_ciphertext: encryptedVerifier.ciphertext,
      verifier_iv: encryptedVerifier.iv,
    });
    if (error)
      throw new EmailHttpError(
        500,
        "Secure email authorization could not start.",
      );

    const origin =
      process.env.EMAIL_OAUTH_REDIRECT_ORIGIN || new URL(request.url).origin;
    const redirectUri = `${origin}/api/email/oauth/${provider}/callback`;
    const challenge = await pkceChallenge(verifier);
    const query = new URLSearchParams({
      client_id: required(
        provider === "gmail"
          ? "GOOGLE_EMAIL_CLIENT_ID"
          : "MICROSOFT_EMAIL_CLIENT_ID",
      ),
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    if (provider === "gmail") {
      query.set(
        "scope",
        [
          "openid",
          "email",
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/gmail.send",
        ].join(" "),
      );
      query.set("access_type", "offline");
      query.set("prompt", "consent");
      if (parsed.data.expectedAddress)
        query.set("login_hint", parsed.data.expectedAddress);
      return Response.json({
        url: `https://accounts.google.com/o/oauth2/v2/auth?${query}`,
      });
    }
    query.set(
      "scope",
      "openid profile email offline_access User.Read Mail.ReadWrite Mail.Send",
    );
    query.set("response_mode", "query");
    if (parsed.data.expectedAddress)
      query.set("login_hint", parsed.data.expectedAddress);
    return Response.json({
      url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${query}`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
