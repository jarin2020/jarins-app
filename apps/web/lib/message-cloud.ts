"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import type { WorkspaceId } from "@/lib/records/schema";
import type {
  ConversationKind,
  HouseholdInvitation,
  MessageAttachment,
  MessagePerson,
  MessageTeam,
  MessageThread,
} from "@/lib/messages";

const ATTACHMENT_BUCKET = "message-attachments-private";
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

type PersonRow = {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
};

type MemberRow = {
  user_id: string;
  member_role: "owner" | "member";
  direct_member: boolean;
  last_read_at: string | null;
};

type AttachmentRow = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
};

type MessageRow = {
  id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
  message_attachments: AttachmentRow[] | null;
};

type ThreadRow = {
  id: string;
  title: string;
  is_family_thread: boolean;
  team_id: string | null;
  direct_key: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  message_thread_members: MemberRow[] | null;
  message_thread_teams: { team_id: string }[] | null;
  messages: MessageRow[] | null;
};

type TeamRow = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  message_team_members: { user_id: string }[] | null;
};

type InvitationRow = {
  id: string;
  email: string;
  role: "adult" | "viewer";
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

function errorMessage(error: { message: string } | null, fallback: string) {
  return error?.message || fallback;
}

function attachmentFromRow(row: AttachmentRow): MessageAttachment {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    storagePath: row.storage_path,
  };
}

export function useCloudMessages({
  supabase,
  userId,
  householdId,
  workspace,
}: {
  supabase: SupabaseBrowserClient;
  userId?: string;
  householdId?: string | null;
  /** Which workspace's conversations to load. The two lists are disjoint. */
  workspace: WorkspaceId;
}) {
  const enabled = Boolean(supabase && userId && householdId);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [people, setPeople] = useState<MessagePerson[]>([]);
  const [teams, setTeams] = useState<MessageTeam[]>([]);
  const [invitations, setInvitations] = useState<HouseholdInvitation[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !userId || !householdId) return;
    setLoading(true);
    try {
      const [
        peopleResult,
        threadResult,
        teamResult,
        inviteResult,
        unreadResult,
      ] = await Promise.all([
        supabase.rpc("list_household_users"),
        supabase
          .from("message_threads")
          .select(
            "id,title,is_family_thread,team_id,direct_key,workspace,created_by,created_at,updated_at,message_thread_members(user_id,member_role,direct_member,last_read_at),message_thread_teams(team_id),messages(id,sender_user_id,body,created_at,message_attachments(id,file_name,mime_type,size_bytes,storage_path))",
          )
          // Scoped twice on purpose. The household keeps a person who belongs
          // to two of them from seeing both Family threads at once, and the
          // workspace is what makes the two message lists genuinely separate
          // rather than one list with a filter on top.
          .eq("household_id", householdId)
          .eq("workspace", workspace)
          .order("updated_at", { ascending: false }),
        supabase
          .from("message_teams")
          .select(
            "id,name,created_by,created_at,updated_at,message_team_members(user_id)",
          )
          .order("name"),
        supabase
          .from("household_invitations")
          .select("id,email,role,expires_at,accepted_at,revoked_at")
          .is("accepted_at", null)
          .is("revoked_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("message_notifications")
          .select("id", { count: "exact", head: true })
          .is("read_at", null),
      ]);

      const coreError =
        peopleResult.error ?? threadResult.error ?? teamResult.error;
      if (coreError) {
        setError(errorMessage(coreError, "Messages could not be loaded."));
        return;
      }

      const personRows = (peopleResult.data ?? []) as PersonRow[];
      const nextPeople: MessagePerson[] = personRows.map((person) => ({
        id: person.user_id,
        name: person.display_name,
        detail: person.email,
        verified: true,
        role: person.role,
        createdAt: "",
        updatedAt: "",
      }));
      const peopleById = new Map(
        nextPeople.map((person) => [person.id, person]),
      );
      const currentUserOwnsHousehold = personRows.some(
        (person) => person.user_id === userId && person.role === "owner",
      );

      const nextThreads = ((threadResult.data ?? []) as unknown as ThreadRow[])
        .map((thread): MessageThread => {
          const members = thread.message_thread_members ?? [];
          const currentMember = members.find(
            (member) => member.user_id === userId,
          );
          const messages = [...(thread.messages ?? [])].sort((a, b) =>
            a.created_at.localeCompare(b.created_at),
          );
          const lastRead = currentMember?.last_read_at;
          // A pair conversation is stored under a key rather than a name, so
          // the other half of the pair is who it is with — and each side sees
          // the other, which no single stored title could manage.
          const directUserId = thread.direct_key
            ? (members.find((member) => member.user_id !== userId)?.user_id ??
              null)
            : null;
          return {
            id: thread.id,
            title: thread.title,
            isFamily: thread.is_family_thread,
            teamId: thread.team_id,
            directUserId,
            kind: (thread.message_thread_teams?.length
              ? "team"
              : "person") as ConversationKind,
            participantIds: members
              .filter(
                (member) => member.direct_member && member.user_id !== userId,
              )
              .map((member) => member.user_id),
            teamIds: (thread.message_thread_teams ?? []).map(
              (team) => team.team_id,
            ),
            memberRole: currentMember?.member_role,
            unreadCount: messages.filter(
              (message) =>
                message.sender_user_id !== userId &&
                (!lastRead || message.created_at > lastRead),
            ).length,
            messages: messages.map((message) => ({
              id: message.id,
              text: message.body,
              senderId: message.sender_user_id,
              author:
                peopleById.get(message.sender_user_id)?.name ??
                "Household member",
              readBy: members
                .filter(
                  (member) =>
                    member.user_id !== message.sender_user_id &&
                    Boolean(member.last_read_at) &&
                    member.last_read_at! >= message.created_at,
                )
                .map(
                  (member) =>
                    peopleById.get(member.user_id)?.name ?? "Household member",
                ),
              attachments: (message.message_attachments ?? []).map(
                attachmentFromRow,
              ),
              createdAt: message.created_at,
            })),
            createdAt: thread.created_at,
            updatedAt: thread.updated_at,
          };
        })
        .sort(
          (a, b) =>
            Number(Boolean(b.isFamily)) - Number(Boolean(a.isFamily)) ||
            b.updatedAt.localeCompare(a.updatedAt),
        );

      setPeople(nextPeople);
      setThreads(nextThreads);
      setTeams(
        ((teamResult.data ?? []) as unknown as TeamRow[]).map((team) => ({
          id: team.id,
          name: team.name,
          memberIds: (team.message_team_members ?? []).map(
            (member) => member.user_id,
          ),
          canManage: team.created_by === userId || currentUserOwnsHousehold,
          createdAt: team.created_at,
          updatedAt: team.updated_at,
        })),
      );
      if (!inviteResult.error) {
        setInvitations(
          ((inviteResult.data ?? []) as InvitationRow[]).map((invitation) => ({
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            expiresAt: invitation.expires_at,
            acceptedAt: invitation.accepted_at ?? undefined,
            revokedAt: invitation.revoked_at ?? undefined,
          })),
        );
      }
      if (!unreadResult.error) setUnreadCount(unreadResult.count ?? 0);

      const secondaryError = inviteResult.error ?? unreadResult.error;
      setError(
        secondaryError
          ? errorMessage(
              secondaryError,
              "Some message details could not be loaded.",
            )
          : "",
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Messages could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [householdId, supabase, userId, workspace]);

  useEffect(() => {
    if (!enabled) {
      queueMicrotask(() => {
        setThreads([]);
        setPeople([]);
        setTeams([]);
        setInvitations([]);
        setUnreadCount(0);
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
      .channel(`messages:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_threads" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_thread_members" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_thread_teams" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_teams" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_team_members" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_attachments" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_notifications" },
        refresh,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, load, supabase]);

  const create = useCallback(
    async (input: {
      title: string;
      kind: ConversationKind;
      participantIds?: string[];
      teamIds?: string[];
    }) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { data, error: rpcError } = await supabase.rpc(
        "create_message_thread",
        {
          thread_title: input.title,
          participant_ids: input.participantIds ?? [],
          team_ids: input.teamIds ?? [],
          thread_workspace: workspace,
        },
      );
      if (rpcError) throw new Error(rpcError.message);
      await load();
      const id = data as string;
      return { id };
    },
    [load, supabase, workspace],
  );

  const updateThread = useCallback(
    async (
      threadId: string,
      changes: { title: string; participantIds: string[]; teamIds: string[] },
    ) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { error: rpcError } = await supabase.rpc("update_message_thread", {
        target_thread: threadId,
        thread_title: changes.title,
        participant_ids: changes.participantIds,
        team_ids: changes.teamIds,
      });
      if (rpcError) throw new Error(rpcError.message);
      await load();
    },
    [load, supabase],
  );

  const removeThread = useCallback(
    async (threadId: string) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { error: removeError } = await supabase
        .from("message_threads")
        .delete()
        .eq("id", threadId);
      if (removeError) throw new Error(removeError.message);
      await load();
    },
    [load, supabase],
  );

  /** Re-derives the Family thread's members from the household. Membership is
   *  meant to follow automatically; this is the button for when it has not. */
  const syncFamily = useCallback(async () => {
    if (!supabase) throw new Error("Accounts are not connected.");
    const { error: rpcError } = await supabase.rpc(
      "sync_family_message_thread",
    );
    if (rpcError) throw new Error(rpcError.message);
    await load();
  }, [load, supabase]);

  /** The team's own conversation, made the first time somebody opens it. */
  const openTeamThread = useCallback(
    async (teamId: string) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { data, error: rpcError } = await supabase.rpc(
        "ensure_team_message_thread",
        { target_team: teamId },
      );
      if (rpcError) throw new Error(rpcError.message);
      await load();
      return data as string | null;
    },
    [load, supabase],
  );

  const openDirectThread = useCallback(
    async (personId: string) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { data, error: rpcError } = await supabase.rpc(
        "ensure_direct_message_thread",
        { target_user: personId, thread_workspace: workspace },
      );
      if (rpcError) throw new Error(rpcError.message);
      await load();
      return data as string | null;
    },
    [load, supabase, workspace],
  );

  const createTeam = useCallback(
    async (input: { name: string; memberIds: string[] }) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { data, error: rpcError } = await supabase.rpc(
        "create_message_team",
        { team_name: input.name, member_ids: input.memberIds },
      );
      if (rpcError) throw new Error(rpcError.message);
      await load();
      return { id: data as string };
    },
    [load, supabase],
  );

  const updateTeam = useCallback(
    async (teamId: string, changes: { name: string; memberIds: string[] }) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { error: rpcError } = await supabase.rpc("update_message_team", {
        target_team: teamId,
        team_name: changes.name,
        member_ids: changes.memberIds,
      });
      if (rpcError) throw new Error(rpcError.message);
      await load();
    },
    [load, supabase],
  );

  const removeTeam = useCallback(
    async (teamId: string) => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { error: removeError } = await supabase
        .from("message_teams")
        .delete()
        .eq("id", teamId);
      if (removeError) throw new Error(removeError.message);
      await load();
    },
    [load, supabase],
  );

  const send = useCallback(
    async (
      threadId: string,
      input: { text: string; author: string; files?: File[] },
    ) => {
      if (!supabase || !userId || !householdId)
        throw new Error("Sign in before sending a message.");
      const files = input.files ?? [];
      for (const file of files) {
        if (!ALLOWED_ATTACHMENT_TYPES.has(file.type))
          throw new Error(`${file.name} is not a supported attachment type.`);
        if (file.size > MAX_ATTACHMENT_BYTES)
          throw new Error(`${file.name} is larger than 20 MB.`);
      }

      const uploaded: { file: File; path: string }[] = [];
      const messageId = crypto.randomUUID();
      try {
        for (const file of files) {
          const path = `${householdId}/${threadId}/${userId}/${crypto.randomUUID()}`;
          const { error: uploadError } = await supabase.storage
            .from(ATTACHMENT_BUCKET)
            .upload(path, file, { contentType: file.type, upsert: false });
          if (uploadError) throw new Error(uploadError.message);
          uploaded.push({ file, path });
        }

        const { error: messageError } = await supabase.from("messages").insert({
          id: messageId,
          household_id: householdId,
          thread_id: threadId,
          sender_user_id: userId,
          body: input.text.trim(),
        });
        if (messageError) throw new Error(messageError.message);

        if (uploaded.length) {
          const { error: attachmentError } = await supabase
            .from("message_attachments")
            .insert(
              uploaded.map(({ file, path }) => ({
                household_id: householdId,
                message_id: messageId,
                uploader_user_id: userId,
                storage_path: path,
                file_name: file.name,
                mime_type: file.type,
                size_bytes: file.size,
              })),
            );
          if (attachmentError) throw new Error(attachmentError.message);
        }
      } catch (sendError) {
        if (uploaded.length)
          await supabase.storage
            .from(ATTACHMENT_BUCKET)
            .remove(uploaded.map(({ path }) => path));
        await supabase.from("messages").delete().eq("id", messageId);
        throw sendError;
      }
      await load();
    },
    [householdId, load, supabase, userId],
  );

  const markRead = useCallback(
    async (threadId: string) => {
      if (!supabase) return;
      const { error: rpcError } = await supabase.rpc(
        "mark_message_thread_read",
        { target_thread: threadId },
      );
      if (rpcError) throw new Error(rpcError.message);
      await load();
    },
    [load, supabase],
  );

  const invite = useCallback(
    async (email: string, role: "adult" | "viewer") => {
      if (!supabase) throw new Error("Accounts are not connected.");
      const { data, error: rpcError } = await supabase.rpc(
        "create_household_invitation",
        { invitee_email: email, invitee_role: role },
      );
      if (rpcError) throw new Error(rpcError.message);
      await load();
      const result = (data as { invitation_token: string }[] | null)?.[0];
      if (!result) throw new Error("The invitation link could not be created.");
      return `${window.location.origin}/invite/${result.invitation_token}`;
    },
    [load, supabase],
  );

  const revokeInvitation = useCallback(
    async (invitationId: string) => {
      if (!supabase) return;
      const { error: rpcError } = await supabase.rpc(
        "revoke_household_invitation",
        { target_invitation: invitationId },
      );
      if (rpcError) throw new Error(rpcError.message);
      await load();
    },
    [load, supabase],
  );

  const openAttachment = useCallback(
    async (attachment: MessageAttachment) => {
      if (!supabase) return;
      const { data, error: signedError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(attachment.storagePath, 60);
      if (signedError) throw new Error(signedError.message);
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    },
    [supabase],
  );

  return {
    threads,
    people,
    teams,
    invitations,
    unreadCount,
    loading,
    error,
    create,
    updateThread,
    removeThread,
    syncFamily,
    openTeamThread,
    openDirectThread,
    createTeam,
    updateTeam,
    removeTeam,
    send,
    markRead,
    invite,
    revokeInvitation,
    openAttachment,
    reload: load,
  };
}
