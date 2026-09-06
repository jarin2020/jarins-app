/**
 * Jarins runs in two modes.
 *
 * Without Supabase credentials it is a local-only demo: every screen works,
 * data lives in this browser, and no route is guarded. With credentials it is
 * a real multi-device app behind authentication.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time, so this resolves the same
 * way in the browser, on the server and inside the Cloudflare Worker.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/** Narrows the two values for call sites that have already checked the flag. */
export function requireSupabaseConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return { url: supabaseUrl, anonKey: supabaseAnonKey };
}

/**
 * The origin Realtime opens its WebSocket on, which is the REST origin with a
 * `wss:` (or, against a local Supabase, `ws:`) scheme.
 *
 * This exists solely for `connect-src`. CSP scheme matching is not symmetric:
 * an `https:` source authorizes `https:` only, so listing the project URL does
 * *not* permit `wss://<ref>.supabase.co/realtime/v1/websocket`. Omit this and
 * the browser blocks the socket while every REST call still succeeds — which
 * looks exactly like working software that never updates until it is reloaded.
 */
export function toSocketOrigin(url: string) {
  return url.trim().replace(/\/+$/, "").replace(/^http/, "ws");
}

export const supabaseSocketUrl = supabaseUrl
  ? toSocketOrigin(supabaseUrl)
  : undefined;
