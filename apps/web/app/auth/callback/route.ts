import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Completes the PKCE exchange for magic links and email confirmations.
 *
 * Without this route the sign-in flow cannot finish: the browser client uses
 * PKCE, so the link returns a `code` that has to be traded for a session
 * server-side before any cookie exists.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requested = searchParams.get("next") ?? "/home";

  // Only same-origin relative paths. "//evil.example" is protocol-relative and
  // would otherwise turn this into an open redirect.
  const next =
    requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/home";

  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.redirect(`${origin}/login?error=not_configured`);

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=link_expired`);

  return NextResponse.redirect(`${origin}${next}`);
}
