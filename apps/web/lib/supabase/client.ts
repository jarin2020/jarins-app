import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured, requireSupabaseConfig } from "./config";

export type SupabaseBrowserClient = ReturnType<
  typeof createSupabaseBrowserClient
>;

/**
 * Returns null when Supabase is not configured, which is the signal the rest of
 * the app uses to stay in local demo mode.
 */
export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured) return null;
  const { url, anonKey } = requireSupabaseConfig();
  return createBrowserClient(url, anonKey);
}
