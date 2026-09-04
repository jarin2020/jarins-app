"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
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
import {
  buildAccountProfile,
  type AccountProfile,
  type StoredAccountProfile,
} from "@/lib/account-profile";

/**
 * `demo` means Supabase is not configured: the app runs on this browser only and
 * no route is guarded. The other three describe a configured deployment.
 */
export type AuthStatus = "demo" | "loading" | "signed-in" | "signed-out";

type AuthValue = {
  supabase: SupabaseBrowserClient;
  user: User | null;
  profile: AccountProfile | null;
  householdId: string | null;
  status: AuthStatus;
  signOut: () => Promise<void>;
  refreshHousehold: () => Promise<string | null>;
  updateProfile: (profile: {
    displayName: string;
    timezone: string;
    locale: "en" | "de";
  }) => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [resolvedHousehold, setResolvedHousehold] = useState<string | null>(
    null,
  );
  const [storedProfile, setStoredProfile] = useState<{
    userId: string;
    value: StoredAccountProfile;
  } | null>(null);
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
  const profile = user
    ? buildAccountProfile(
        user,
        storedProfile?.userId === user.id ? storedProfile.value : null,
      )
    : null;

  useEffect(() => {
    if (!supabase || !user) return;
    let active = true;
    void supabase
      .from("profiles")
      .select("display_name, timezone, locale")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("[jarins] could not resolve profile", error.message);
          return;
        }
        if (data)
          setStoredProfile({
            userId: user.id,
            value: data as StoredAccountProfile,
          });
      });
    return () => {
      active = false;
    };
  }, [supabase, user]);

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
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    router.replace("/login");
    router.refresh();
  }, [router, supabase]);

  const refreshHousehold = useCallback(async () => {
    if (!supabase || !user) return null;
    const { data, error } = await supabase.rpc("current_household");
    if (error) throw new Error(error.message);
    const nextHousehold = (data as string | null) ?? null;
    setResolvedHousehold(nextHousehold);
    return nextHousehold;
  }, [supabase, user]);

  const updateProfile = useCallback(
    async (next: {
      displayName: string;
      timezone: string;
      locale: "en" | "de";
    }) => {
      if (!supabase || !user) return;
      const value: StoredAccountProfile = {
        display_name: next.displayName.trim(),
        timezone: next.timezone.trim(),
        locale: next.locale,
      };
      const { error } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          ...value,
        },
        { onConflict: "id" },
      );
      if (error) throw new Error(error.message);

      setStoredProfile({ userId: user.id, value });
      const { error: metadataError } = await supabase.auth.updateUser({
        data: { display_name: value.display_name },
      });
      if (metadataError)
        console.error(
          "[jarins] could not update profile metadata",
          metadataError.message,
        );
    },
    [supabase, user],
  );

  const value = useMemo<AuthValue>(
    () => ({
      supabase,
      user,
      profile,
      householdId,
      status,
      signOut,
      refreshHousehold,
      updateProfile,
    }),
    [
      supabase,
      user,
      profile,
      householdId,
      status,
      signOut,
      refreshHousehold,
      updateProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
