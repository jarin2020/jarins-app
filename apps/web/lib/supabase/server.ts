import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured, requireSupabaseConfig } from "./config";

export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured) return null;
  const { url, anonKey } = requireSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      /**
       * The second argument @supabase/ssr passes here is the no-store header set
       * that must accompany an auth cookie. It is deliberately unused: this
       * client is built on next/headers, which reaches the cookie jar but not
       * the response headers. The middleware runs on every matched request and
       * sets both there; see middleware.ts.
       */
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot set cookies. The middleware refreshes the
          // session on every request, so this is safe to swallow.
        }
      },
    },
  });
}
