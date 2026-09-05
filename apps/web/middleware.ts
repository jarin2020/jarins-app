import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase/config";

/**
 * Routes reachable without a session. Everything else requires one.
 *
 * Every signed-out screen lives under /auth, so this is a prefix rather than a
 * list that has to be extended each time one is added. /auth/reset-password is
 * covered deliberately: a recovery link signs the person in before it lands, so
 * it is normally reached with a session — but an expired link arrives without
 * one, and guarding the route would bounce them to sign-in with no explanation.
 */
const PUBLIC_PATHS = ["/auth", "/onboarding"];

/**
 * Where the signed-out screens used to live. These stay as permanent redirects
 * because the old paths outlive the rename: they are in already-mailed links,
 * in bookmarks, and in the Supabase redirect allowlist.
 */
const MOVED: Record<string, string> = {
  "/login": "/auth/login",
  "/signup": "/auth/signup",
  "/forgot": "/auth/forgot-password",
  "/reset-password": "/auth/reset-password",
};

/** The old path a request is using, or undefined when it is already current. */
function movedFrom(pathname: string): string | undefined {
  if (MOVED[pathname]) return MOVED[pathname];
  // /invite/<token> carried the token in the path, so it cannot be a table.
  if (pathname.startsWith("/invite/")) return `/auth${pathname}`;
  return undefined;
}
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
  const moved = movedFrom(request.nextUrl.pathname);
  if (moved) {
    const url = request.nextUrl.clone();
    url.pathname = moved;
    // 308 so the method and query survive, and so browsers stop re-asking.
    return NextResponse.redirect(url, 308);
  }

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

  if (!user && !isPublic) return redirectTo("/auth/login", { next: pathname });
  const isEntryScreen =
    pathname === "/auth/login" ||
    pathname === "/auth/signup" ||
    pathname === "/auth/forgot-password";
  // Not /auth/reset-password: a recovery link deliberately arrives signed in.
  if (user && isEntryScreen) return redirectTo("/home");

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, which need no session and no CSP.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|robots.txt).*)",
  ],
};
