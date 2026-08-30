"use client";

import type { User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createSupabaseBrowserClient,
  type SupabaseBrowserClient,
} from "@/lib/supabase/client";
import { migrateLocalRecords } from "@/lib/records/migrate";

/**
 * `demo` means Supabase is not configured: the app runs on this browser only and
 * no route is guarded. The other three describe a configured deployment.
 */
export type AuthStatus = "demo" | "loading" | "signed-in" | "signed-out";

type AuthValue = {
  supabase: SupabaseBrowserClient;
  user: User | null;
  householdId: string | null;
  status: AuthStatus;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [resolvedHousehold, setResolvedHousehold] = useState<string | null>(
    null,
  );
  const [status, setStatus] = useState<AuthStatus>(
    supabase ? "loading" : "demo",
  );

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    // getUser() revalidates with the auth server rather than trusting the cookie.
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setStatus(data.user ? "signed-in" : "signed-out");
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setStatus(session?.user ? "signed-in" : "signed-out");
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  // Derived rather than reset in an effect, so signing out clears it in the
  // same render as the user disappearing.
  const householdId = user ? resolvedHousehold : null;

  useEffect(() => {
    if (!supabase || !user) return;
    let active = true;
    void supabase.rpc("current_household").then(({ data, error }) => {
      if (!active) return;
      if (error)
        console.error("[jarins] could not resolve household", error.message);
      setResolvedHousehold((data as string | null) ?? null);
    });
    return () => {
      active = false;
    };
  }, [supabase, user]);

  // Anything captured before signing up follows the user into their account.
  useEffect(() => {
    if (!supabase || !user || !householdId) return;
    void migrateLocalRecords(supabase, householdId);
  }, [supabase, user, householdId]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, [supabase]);

  const value = useMemo<AuthValue>(
    () => ({ supabase, user, householdId, status, signOut }),
    [supabase, user, householdId, status, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
