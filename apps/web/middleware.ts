import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase/config";

/** Routes reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = ["/login", "/signup", "/invite", "/auth", "/onboarding"];

function buildCsp(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  return [
    `default-src 'self'`,
    // 'strict-dynamic' lets Next's nonced bootstrap load its own chunks.
    // Dev additionally needs 'unsafe-eval' for React Fast Refresh.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""}`,
    // Required only by the two progress bars that set width via the style
    // attribute (records-workspace.tsx, today-view.tsx). Remove this once those
    // move to a class-driven custom property.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self' ${supabaseUrl ?? ""}`.trim(),
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ]
    .filter(Boolean)
    .join("; ")
    .replace(/\s+/g, " ");
}

function securityHeaders(response: NextResponse, csp: string) {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  return response;
}

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Next reads the nonce back off the request's CSP header and stamps it onto
  // every script tag it renders.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = securityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    csp,
  );

  // Local demo mode: still send the security headers, but guard nothing —
  // there is no session to check and no server-side data to protect.
  if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey)
    return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) =>
        list.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        ),
    },
  });

  // getUser() revalidates against the auth server. getSession() only reads the
  // cookie and must never be used for an authorization decision.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  /**
   * A redirect creates a fresh response, which does not carry the refreshed
   * auth cookies written above. Without copying them across, a user whose token
   * was just rotated is bounced back to /login on every request.
   */
  const redirectTo = (pathname_: string, search?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname_;
    url.search = "";
    Object.entries(search ?? {}).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );
    const redirect = securityHeaders(NextResponse.redirect(url), csp);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!user && !isPublic) return redirectTo("/login", { next: pathname });
  if (user && (pathname === "/login" || pathname === "/signup"))
    return redirectTo("/home");

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, which need no session and no CSP.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|robots.txt).*)",
  ],
};
