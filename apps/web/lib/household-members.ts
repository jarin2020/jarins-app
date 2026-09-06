"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { invitationLink } from "@/lib/invitation-message";
import { isProfileAccent, type ProfileAccent } from "@/lib/account-profile";
import { parseProfileLinks, type ProfileLink } from "@/lib/profile-links";

export type HouseholdAccountRole = "owner" | "adult" | "child" | "viewer";

export type HouseholdAccountMember = {
  userId: string;
  displayName: string;
  email: string;
  role: HouseholdAccountRole;
  /** Object in the `avatars` bucket; the signed URL is resolved separately. */
  avatarPath: string | null;
  accent: ProfileAccent;
  pronouns: string;
  headline: string;
  // Everything below is withheld by list_household_users() unless the member
  // shares it, so an empty value here means "not published", not "not set".
  location: string;
  phone: string;
  birthday: string;
  bio: string;
  links: ProfileLink[];
  emergencyContact: { name: string; phone: string; relation: string };
  /** Whether this member publishes the fields above. Their own row always
   *  reads back whole, so this is what tells them the others cannot see it. */
  sharesContact: boolean;
};

export type HouseholdPendingInvitation = {
  id: string;
  email: string;
  role: "adult" | "viewer";
  expiresAt: string;
};

type HouseholdUserRow = {
  user_id: string;
  display_name: string;
  email: string;
  role: HouseholdAccountRole;
  avatar_path: string | null;
  accent_color: string | null;
  pronouns: string | null;
  headline: string | null;
  location: string | null;
  phone: string | null;
  birthday: string | null;
  bio: string | null;
  links: unknown;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  shares_contact: boolean | null;
};

const text = (value: string | null | undefined) => value?.trim() ?? "";

/** Matches the account's own avatar URL lifetime in auth-provider.tsx. */
const avatarUrlSeconds = 60 * 60;

type InvitationRow = {
  id: string;
  email: string;
  role: "adult" | "viewer";
  expires_at: string;
};

function readableError(error: { message?: string } | null, fallback: string) {
  return error?.message || fallback;
}

export function useHouseholdMembers({
  supabase,
  userId,
  householdId,
}: {
  supabase: SupabaseBrowserClient;
  userId?: string;
  householdId?: string | null;
}) {
  const enabled = Boolean(supabase && userId && householdId);
  const [members, setMembers] = useState<HouseholdAccountMember[]>([]);
  const [invitations, setInvitations] = useState<HouseholdPendingInvitation[]>(
    [],
  );
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !userId || !householdId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [memberResult, invitationResult] = await Promise.all([
      supabase.rpc("list_household_users"),
      supabase
        .from("household_invitations")
        .select("id,email,role,expires_at")
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
    ]);
    const firstError = memberResult.error ?? invitationResult.error;
    if (firstError) {
      setError(readableError(firstError, "Family members could not load."));
      setLoading(false);
      return;
    }
    setMembers(
      ((memberResult.data ?? []) as HouseholdUserRow[]).map((member) => ({
        userId: member.user_id,
        displayName: member.display_name,
        email: member.email,
        role: member.role,
        avatarPath: member.avatar_path,
        accent: isProfileAccent(member.accent_color)
          ? member.accent_color
          : "green",
        pronouns: text(member.pronouns),
        headline: text(member.headline),
        location: text(member.location),
        phone: text(member.phone),
        birthday: text(member.birthday).slice(0, 10),
        bio: text(member.bio),
        links: parseProfileLinks(member.links),
        emergencyContact: {
          name: text(member.emergency_contact_name),
          phone: text(member.emergency_contact_phone),
          relation: text(member.emergency_contact_relation),
        },
        sharesContact: member.shares_contact !== false,
      })),
    );
    setInvitations(
      ((invitationResult.data ?? []) as InvitationRow[]).map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expires_at,
      })),
    );
    setError("");
    setLoading(false);
  }, [householdId, supabase, userId]);

  useEffect(() => {
    if (!enabled) {
      queueMicrotask(() => {
        setMembers([]);
        setInvitations([]);
        setLoading(false);
      });
      return;
    }
    queueMicrotask(() => void load());
  }, [enabled, load]);

  // The avatars bucket is private, so a face is a signed URL. Signed in one
  // call for the whole directory rather than one per card, and keyed by path
  // so that a member who changes their photo re-signs and the rest do not.
  const avatarPaths = members
    .map((member) => member.avatarPath)
    .filter((path): path is string => Boolean(path))
    .sort()
    .join(",");
  useEffect(() => {
    const paths = avatarPaths ? avatarPaths.split(",") : [];
    if (!supabase || !paths.length) return;
    let active = true;
    void supabase.storage
      .from("avatars")
      .createSignedUrls(paths, avatarUrlSeconds)
      .then(({ data, error: signError }) => {
        if (!active) return;
        if (signError) {
          console.error(
            "[jarins] could not sign family photos",
            signError.message,
          );
          return;
        }
        const signed: Record<string, string> = {};
        for (const item of data ?? [])
          if (item.path && item.signedUrl) signed[item.path] = item.signedUrl;
        setAvatarUrls((previous) => ({ ...previous, ...signed }));
      });
    return () => {
      active = false;
    };
  }, [avatarPaths, supabase]);

  useEffect(() => {
    if (!supabase || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 80);
    };
    const channel = supabase
      .channel(`family-directory:${householdId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "household_members",
          filter: `household_id=eq.${householdId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "household_invitations",
          filter: `household_id=eq.${householdId}`,
        },
        refresh,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, householdId, load, supabase]);

  const invite = useCallback(
    async (email: string, role: "adult" | "viewer") => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { data, error: inviteError } = await supabase.rpc(
        "create_household_invitation",
        { invitee_email: email, invitee_role: role },
      );
      if (inviteError) throw new Error(inviteError.message);
      const result = (data as { invitation_token: string }[] | null)?.[0];
      if (!result) throw new Error("The invitation link could not be created.");
      await load();
      return invitationLink(window.location.origin, result.invitation_token);
    },
    [load, supabase],
  );

  const revokeInvitation = useCallback(
    async (invitationId: string) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { error: revokeError } = await supabase.rpc(
        "revoke_household_invitation",
        { target_invitation: invitationId },
      );
      if (revokeError) throw new Error(revokeError.message);
      await load();
    },
    [load, supabase],
  );

  const updateRole = useCallback(
    async (memberId: string, role: "adult" | "viewer") => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { error: updateError } = await supabase.rpc(
        "update_household_member_role",
        { target_user: memberId, target_role: role },
      );
      if (updateError) throw new Error(updateError.message);
      await load();
    },
    [load, supabase],
  );

  const remove = useCallback(
    async (memberId: string) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { error: removeError } = await supabase.rpc(
        "remove_household_member",
        { target_user: memberId },
      );
      if (removeError) throw new Error(removeError.message);
      await load();
    },
    [load, supabase],
  );

  const currentMember = members.find((member) => member.userId === userId);
  return {
    members,
    avatarUrls,
    invitations,
    loading,
    error,
    canManage: currentMember?.role === "owner",
    invite,
    revokeInvitation,
    updateRole,
    remove,
    reload: load,
  };
}
