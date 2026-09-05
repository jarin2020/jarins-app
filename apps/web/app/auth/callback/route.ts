import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Completes every link Supabase mails: confirmations, magic links and password
 * recovery all land here.
 *
 * Three shapes arrive at this route and all three have to be handled.
 *
 * - `?code=` — the PKCE exchange. The browser client stores the verifier in a
 *   cookie, so only the server can finish it, which is why this route exists.
 * - `?token_hash=&type=` — what the templates produce when they use
 *   `{{ .TokenHash }}` instead of `{{ .ConfirmationURL }}`. Previously this
 *   fell through to `missing_code` and the link looked broken.
 * - `?error=` — Supabase's own verify endpoint redirects here with an error
 *   rather than a token when a link is expired or already spent. That also
 *   used to read as `missing_code`, which told the person nothing true.
 */

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function isOtpType(value: string | null): value is EmailOtpType {
  return !!value && (OTP_TYPES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const requested = searchParams.get("next") ?? "/home";

  // Only same-origin relative paths. "//evil.example" is protocol-relative and
  // would otherwise turn this into an open redirect.
  const next =
    requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/home";

  const back = (error: string) =>
    NextResponse.redirect(`${origin}/auth/login?error=${error}`);

  // Supabase rejected the link before we ever saw a token.
  const upstreamError =
    searchParams.get("error_code") ?? searchParams.get("error");
  if (upstreamError)
    return back(
      upstreamError.includes("expired") ? "link_expired" : "access_denied",
    );

  const supabase = await createSupabaseServerClient();
  if (!supabase) return back("not_configured");

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return back("link_expired");
    return NextResponse.redirect(`${origin}${next}`);
  }

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  if (tokenHash && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) return back("link_expired");
    // A recovery link must land on the change-password form, whatever `next`
    // says, or the person is silently signed in and never sets a password.
    return NextResponse.redirect(
      `${origin}${type === "recovery" ? "/auth/reset-password" : next}`,
    );
  }

  return back("missing_code");
}
