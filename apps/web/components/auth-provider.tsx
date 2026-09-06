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
import {
  accountProfileColumns,
  buildAccountProfile,
  toAccountProfileWrite,
  type AccountProfile,
  type AccountProfileDraft,
  type StoredAccountProfile,
} from "@/lib/account-profile";

/** What the `avatars` bucket accepts, mirrored so the picker can say so first. */
const avatarExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const maxAvatarBytes = 5 * 1024 * 1024;
/** Long enough to outlast a session on one screen, short enough that a URL
 *  copied out of the DOM is not a lasting handle on a family photo. */
const avatarUrlSeconds = 60 * 60;

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
  updateProfile: (profile: AccountProfileDraft) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  /** Signed URL for the signed-in account's own photo, or null. */
  avatarUrl: string | null;
  uploadAvatar: (file: File) => Promise<void>;
  removeAvatar: () => Promise<void>;
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
  const [signedAvatar, setSignedAvatar] = useState<{
    path: string;
    url: string;
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
  // Memoised, not just derived: this object is handed to every consumer through
  // context, and rebuilding it on each render of the provider gave the settings
  // form a "new" profile every time an avatar URL or a token arrived.
  const profile = useMemo(
    () =>
      user
        ? buildAccountProfile(
            user,
            storedProfile?.userId === user.id ? storedProfile.value : null,
          )
        : null,
    [storedProfile, user],
  );

  useEffect(() => {
    if (!supabase || !user) return;
    let active = true;
    void supabase
      .from("profiles")
      .select(accountProfileColumns)
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

  // The bucket is private, so a photo is a signed URL with an expiry rather
  // than a src. Signed whenever the path changes, which covers upload, removal
  // and switching accounts alike.
  //
  // The URL is kept next to the path it was signed for and matched on read
  // rather than cleared in the effect body. That is what stops a replaced photo
  // from showing the previous one for a frame while the new URL is in flight.
  const avatarUrl =
    profile?.avatarPath && signedAvatar?.path === profile.avatarPath
      ? signedAvatar.url
      : null;

  useEffect(() => {
    const path = profile?.avatarPath;
    if (!supabase || !path) return;
    let active = true;
    void supabase.storage
      .from("avatars")
      .createSignedUrl(path, avatarUrlSeconds)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data?.signedUrl) {
          if (error)
            console.error(
              "[jarins] could not sign the avatar URL",
              error.message,
            );
          return;
        }
        setSignedAvatar({ path, url: data.signedUrl });
      });
    return () => {
      active = false;
    };
  }, [supabase, profile?.avatarPath]);

  // Anything captured before signing up follows the user into their account.
  useEffect(() => {
    if (!supabase || !user || !householdId) return;
    // Loaded here rather than at the top of the file: the migration pulls the
    // record schema, its repositories and the seed data behind it, none of
    // which a signed-out visitor looking at the sign-in form has any use for.
    void import("@/lib/records/migrate").then(({ migrateLocalRecords }) =>
      migrateLocalRecords(supabase, householdId),
    );
  }, [supabase, user, householdId]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    router.replace("/auth/login");
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
    async (next: AccountProfileDraft) => {
      if (!supabase || !user) return;
      const value = toAccountProfileWrite(next);
      const { error } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          ...value,
        },
        { onConflict: "id" },
      );
      if (error) throw new Error(error.message);

      // Merged rather than replaced: the write deliberately leaves avatar_path
      // alone, and dropping it here would blank the photo until the next load.
      setStoredProfile((previous) => ({
        userId: user.id,
        value: {
          ...(previous?.userId === user.id ? previous.value : {}),
          ...value,
        },
      }));
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

  const setAvatarPath = useCallback(
    async (path: string | null) => {
      if (!supabase || !user) return;
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, avatar_path: path }, { onConflict: "id" });
      if (error) throw new Error(error.message);
      setStoredProfile((previous) => ({
        userId: user.id,
        value: {
          ...(previous?.userId === user.id
            ? previous.value
            : { display_name: null, timezone: null, locale: null }),
          avatar_path: path,
        },
      }));
    },
    [supabase, user],
  );

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!supabase || !user) throw new Error("Sign in to add a photo.");
      // The bucket's own limits, checked first so the person reads a sentence
      // rather than a storage API error after a five-megabyte upload.
      const extension = avatarExtensions[file.type];
      if (!extension) throw new Error("Use a JPEG, PNG or WebP image.");
      if (file.size > maxAvatarBytes)
        throw new Error("Photos must be 5 MB or smaller.");
      // The household folder, not the user folder: the storage policies read
      // the first path segment as a household, which is what lets the rest of
      // the family see the photo at all.
      if (!householdId)
        throw new Error(
          "Your household is still loading. Try again in a moment.",
        );
      const path = `${householdId}/${crypto.randomUUID()}.${extension}`;
      const previous = storedProfile?.value.avatar_path ?? null;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      try {
        await setAvatarPath(path);
      } catch (error) {
        // Nothing points at the object now, so leaving it would be a private
        // photo no screen can reach and no person can delete.
        await supabase.storage.from("avatars").remove([path]);
        throw error;
      }
      // Best effort, and after the row is committed: a failed cleanup costs
      // storage, a cleanup before the write costs the photo.
      if (previous && previous !== path)
        void supabase.storage.from("avatars").remove([previous]);
    },
    [householdId, setAvatarPath, storedProfile, supabase, user],
  );

  const removeAvatar = useCallback(async () => {
    if (!supabase || !user) return;
    const previous = storedProfile?.value.avatar_path ?? null;
    await setAvatarPath(null);
    if (previous) void supabase.storage.from("avatars").remove([previous]);
  }, [setAvatarPath, storedProfile, supabase, user]);

  const updatePassword = useCallback(
    async (password: string) => {
      if (!supabase || !user)
        throw new Error("Sign in to change your password.");
      if (password.length < 10) throw new Error("Use at least 10 characters.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
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
      updatePassword,
      avatarUrl,
      uploadAvatar,
      removeAvatar,
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
      updatePassword,
      avatarUrl,
      uploadAvatar,
      removeAvatar,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
