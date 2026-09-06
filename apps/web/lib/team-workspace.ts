"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";

export type TeamRole = "owner" | "member";

export type TeamMember = {
  userId: string;
  name: string;
  email: string;
  role: TeamRole;
};

export type TeamTask = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  date: string;
  status: "open" | "in-progress" | "done" | "paused";
  assigneeUserId: string | null;
};

export type Team = {
  id: string;
  name: string;
  createdBy: string;
  members: TeamMember[];
  /** The signed-in person's role, or null when they are only a spectator. */
  myRole: TeamRole | null;
  /** Whether they may add people, assign work and rename the team. */
  canManage: boolean;
};

type TeamRow = {
  id: string;
  name: string;
  created_by: string;
  message_team_members: { user_id: string; member_role: TeamRole }[] | null;
};

type TaskRow = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  date: string | null;
  status: TeamTask["status"];
  team_id: string | null;
  assignee_user_id: string | null;
};

type DirectoryRow = { user_id: string; display_name: string; email: string };

const TASK_COLUMNS =
  "id,kind,title,detail,date,status,team_id,assignee_user_id";

/**
 * Teams as a place to work: who is in one, what their role is, and what has
 * been assigned to whom.
 *
 * Separate from useCloudMessages on purpose. That hook exists to render
 * conversations and already carries a lot; this one answers a different
 * question and can be loaded only by the screen that asks it.
 */
export function useTeamWorkspace({
  supabase,
  userId,
  householdId,
}: {
  supabase: SupabaseBrowserClient;
  userId?: string;
  householdId?: string | null;
}) {
  const enabled = Boolean(supabase && userId && householdId);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [directory, setDirectory] = useState<DirectoryRow[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !userId || !householdId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [teamResult, taskResult, peopleResult] = await Promise.all([
      supabase
        .from("message_teams")
        .select("id,name,created_by,message_team_members(user_id,member_role)")
        .order("name"),
      supabase
        .from("life_records")
        .select(TASK_COLUMNS)
        .not("team_id", "is", null)
        .order("created_at", { ascending: false }),
      supabase.rpc("list_household_users"),
    ]);
    const failure = teamResult.error ?? taskResult.error ?? peopleResult.error;
    if (failure) {
      setError(failure.message || "Teams could not be loaded.");
      setLoading(false);
      return;
    }

    const people = (peopleResult.data ?? []) as DirectoryRow[];
    const nameOf = new Map(people.map((row) => [row.user_id, row]));
    setDirectory(people);
    setTeams(
      ((teamResult.data ?? []) as TeamRow[]).map((row) => {
        const members = (row.message_team_members ?? []).map((member) => ({
          userId: member.user_id,
          name: nameOf.get(member.user_id)?.display_name ?? "Household member",
          email: nameOf.get(member.user_id)?.email ?? "",
          role: member.member_role,
        }));
        const mine = members.find((member) => member.userId === userId);
        return {
          id: row.id,
          name: row.name,
          createdBy: row.created_by,
          members,
          myRole: mine?.role ?? null,
          // Mirrors can_manage_message_team: an owner by role, or the person
          // who made it. The database is the boundary; this only decides
          // whether to draw the controls.
          canManage: mine?.role === "owner" || row.created_by === userId,
        };
      }),
    );
    setTasks(
      ((taskResult.data ?? []) as TaskRow[])
        .filter((row) => row.team_id)
        .map((row) => ({
          id: row.id,
          kind: row.kind,
          title: row.title,
          detail: row.detail ?? "",
          date: row.date ?? "",
          status: row.status,
          assigneeUserId: row.assignee_user_id,
          teamId: row.team_id as string,
        })) as (TeamTask & { teamId: string })[],
    );
    setError("");
    setLoading(false);
  }, [householdId, supabase, userId]);

  useEffect(() => {
    if (!enabled) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    queueMicrotask(() => void load());
  }, [enabled, load]);

  const setMembers = useCallback(
    async (team: Team, memberIds: string[]) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { error: rpcError } = await supabase.rpc("update_message_team", {
        target_team: team.id,
        team_name: team.name,
        member_ids: memberIds,
      });
      if (rpcError) throw new Error(rpcError.message);
      await load();
    },
    [load, supabase],
  );

  const setRole = useCallback(
    async (teamId: string, memberId: string, role: TeamRole) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { error: rpcError } = await supabase.rpc("set_message_team_role", {
        target_team: teamId,
        target_user: memberId,
        target_role: role,
      });
      if (rpcError) throw new Error(rpcError.message);
      await load();
    },
    [load, supabase],
  );

  const rename = useCallback(
    async (team: Team, name: string) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { error: rpcError } = await supabase.rpc("update_message_team", {
        target_team: team.id,
        team_name: name,
        member_ids: team.members.map((member) => member.userId),
      });
      if (rpcError) throw new Error(rpcError.message);
      await load();
    },
    [load, supabase],
  );

  const addTask = useCallback(
    async (input: {
      teamId: string;
      title: string;
      kind: string;
      assigneeUserId: string | null;
      date: string;
    }) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { error: insertError } = await supabase
        .from("life_records")
        .insert({
          module: "work",
          kind: input.kind,
          title: input.title.trim(),
          team_id: input.teamId,
          assignee_user_id: input.assigneeUserId,
          date: input.date || null,
        });
      if (insertError) throw new Error(insertError.message);
      await load();
    },
    [load, supabase],
  );

  const updateTask = useCallback(
    async (
      taskId: string,
      changes: Partial<{
        status: TeamTask["status"];
        assignee_user_id: string | null;
      }>,
    ) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { error: updateError } = await supabase
        .from("life_records")
        .update(changes)
        .eq("id", taskId);
      if (updateError) throw new Error(updateError.message);
      await load();
    },
    [load, supabase],
  );

  return {
    teams,
    tasks: tasks as (TeamTask & { teamId: string })[],
    directory,
    loading,
    error,
    reload: load,
    setMembers,
    setRole,
    rename,
    addTask,
    updateTask,
  };
}
