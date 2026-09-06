"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { invitationLink } from "@/lib/invitation-message";

export type HouseholdAccountRole = "owner" | "adult" | "child" | "viewer";

export type HouseholdAccountMember = {
  userId: string;
  displayName: string;
  email: string;
  role: HouseholdAccountRole;
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
};

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
