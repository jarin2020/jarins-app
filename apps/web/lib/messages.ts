"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

export const conversationKinds = ["person", "team"] as const;
export type ConversationKind = (typeof conversationKinds)[number];

const messageSchema = z.object({
  id: z.string().min(1),
  text: z.string().max(4000),
  author: z.string().min(1).max(100),
  senderId: z.string().min(1).optional(),
  readBy: z.array(z.string().min(1)).optional(),
  attachments: z
    .array(
      z.object({
        id: z.string().min(1),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(160),
        sizeBytes: z.number().positive(),
        storagePath: z.string().min(1),
      }),
    )
    .optional(),
  createdAt: z.string().min(1),
});

const messageThreadSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(100),
  kind: z.enum(conversationKinds),
  participantIds: z.array(z.string().min(1)).max(50).optional(),
  teamIds: z.array(z.string().min(1)).max(20).optional(),
  messages: z.array(messageSchema).max(1000),
  isFamily: z.boolean().optional(),
  memberRole: z.enum(["owner", "member"]).optional(),
  unreadCount: z.number().nonnegative().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const messageThreadsSchema = z.array(messageThreadSchema).max(100);

const messagePersonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  detail: z.string().max(160),
  verified: z.boolean().optional(),
  role: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const messageTeamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  memberIds: z.array(z.string().min(1)).max(50),
  canManage: z.boolean().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const messagePeopleSchema = z.array(messagePersonSchema).max(100);
const messageTeamsSchema = z.array(messageTeamSchema).max(50);

export type MessageThread = z.infer<typeof messageThreadSchema>;
export type ThreadMessage = z.infer<typeof messageSchema>;
export type MessagePerson = z.infer<typeof messagePersonSchema>;
export type MessageTeam = z.infer<typeof messageTeamSchema>;
export type MessageAttachment = NonNullable<
  ThreadMessage["attachments"]
>[number];

export type HouseholdInvitation = {
  id: string;
  email: string;
  role: "adult" | "viewer";
  expiresAt: string;
  acceptedAt?: string;
  revokedAt?: string;
};

const STORAGE_PREFIX = "jarins-message-threads-v1";
const PEOPLE_STORAGE_PREFIX = "jarins-message-people-v1";
const TEAMS_STORAGE_PREFIX = "jarins-message-teams-v1";
export const MESSAGES_EVENT = "jarins-message-threads-changed";

export function messagesKey(ownerId: string) {
  return `${STORAGE_PREFIX}:${ownerId}`;
}

export function messagePeopleKey(ownerId: string) {
  return `${PEOPLE_STORAGE_PREFIX}:${ownerId}`;
}

export function messageTeamsKey(ownerId: string) {
  return `${TEAMS_STORAGE_PREFIX}:${ownerId}`;
}

export function readMessageThreads(ownerId: string): MessageThread[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = messageThreadsSchema.safeParse(
      JSON.parse(localStorage.getItem(messagesKey(ownerId)) ?? "[]"),
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function writeMessageThreads(ownerId: string, threads: MessageThread[]) {
  const parsed = messageThreadsSchema.parse(threads);
  localStorage.setItem(messagesKey(ownerId), JSON.stringify(parsed));
  window.dispatchEvent(new Event(MESSAGES_EVENT));
}

export function readMessagePeople(ownerId: string): MessagePerson[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = messagePeopleSchema.safeParse(
      JSON.parse(localStorage.getItem(messagePeopleKey(ownerId)) ?? "[]"),
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function writeMessagePeople(ownerId: string, people: MessagePerson[]) {
  const parsed = messagePeopleSchema.parse(people);
  localStorage.setItem(messagePeopleKey(ownerId), JSON.stringify(parsed));
  window.dispatchEvent(new Event(MESSAGES_EVENT));
}

export function readMessageTeams(ownerId: string): MessageTeam[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = messageTeamsSchema.safeParse(
      JSON.parse(localStorage.getItem(messageTeamsKey(ownerId)) ?? "[]"),
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function writeMessageTeams(ownerId: string, teams: MessageTeam[]) {
  const parsed = messageTeamsSchema.parse(teams);
  localStorage.setItem(messageTeamsKey(ownerId), JSON.stringify(parsed));
  window.dispatchEvent(new Event(MESSAGES_EVENT));
}

export function createMessageThread(
  ownerId: string,
  input: {
    title: string;
    kind: ConversationKind;
    participantIds?: string[];
    teamIds?: string[];
  },
) {
  const now = new Date().toISOString();
  const thread: MessageThread = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    kind: input.kind,
    participantIds: input.participantIds ?? [],
    teamIds: input.teamIds ?? [],
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  writeMessageThreads(ownerId, [thread, ...readMessageThreads(ownerId)]);
  return thread;
}

export function updateMessageThread(
  ownerId: string,
  threadId: string,
  changes: { title: string; participantIds: string[]; teamIds: string[] },
) {
  const now = new Date().toISOString();
  writeMessageThreads(
    ownerId,
    readMessageThreads(ownerId).map((thread) =>
      thread.id === threadId
        ? {
            ...thread,
            title: changes.title.trim(),
            participantIds: changes.participantIds,
            teamIds: changes.teamIds,
            kind: changes.teamIds.length ? "team" : "person",
            updatedAt: now,
          }
        : thread,
    ),
  );
}

export function removeMessageThread(ownerId: string, threadId: string) {
  writeMessageThreads(
    ownerId,
    readMessageThreads(ownerId).filter((thread) => thread.id !== threadId),
  );
}

export function createMessagePerson(
  ownerId: string,
  input: { name: string; detail: string },
) {
  const now = new Date().toISOString();
  const person: MessagePerson = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    detail: input.detail.trim(),
    createdAt: now,
    updatedAt: now,
  };
  writeMessagePeople(ownerId, [...readMessagePeople(ownerId), person]);
  return person;
}

export function updateMessagePerson(
  ownerId: string,
  personId: string,
  changes: { name: string; detail: string },
) {
  writeMessagePeople(
    ownerId,
    readMessagePeople(ownerId).map((person) =>
      person.id === personId
        ? {
            ...person,
            name: changes.name.trim(),
            detail: changes.detail.trim(),
            updatedAt: new Date().toISOString(),
          }
        : person,
    ),
  );
}

export function removeMessagePerson(ownerId: string, personId: string) {
  writeMessagePeople(
    ownerId,
    readMessagePeople(ownerId).filter((person) => person.id !== personId),
  );
  writeMessageTeams(
    ownerId,
    readMessageTeams(ownerId).map((team) => ({
      ...team,
      memberIds: team.memberIds.filter((id) => id !== personId),
    })),
  );
  writeMessageThreads(
    ownerId,
    readMessageThreads(ownerId).map((thread) => ({
      ...thread,
      participantIds: (thread.participantIds ?? []).filter(
        (id) => id !== personId,
      ),
    })),
  );
}

export function createMessageTeam(
  ownerId: string,
  input: { name: string; memberIds: string[] },
) {
  const now = new Date().toISOString();
  const team: MessageTeam = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    memberIds: input.memberIds,
    createdAt: now,
    updatedAt: now,
  };
  writeMessageTeams(ownerId, [...readMessageTeams(ownerId), team]);
  return team;
}

export function updateMessageTeam(
  ownerId: string,
  teamId: string,
  changes: { name: string; memberIds: string[] },
) {
  writeMessageTeams(
    ownerId,
    readMessageTeams(ownerId).map((team) =>
      team.id === teamId
        ? {
            ...team,
            name: changes.name.trim(),
            memberIds: changes.memberIds,
            updatedAt: new Date().toISOString(),
          }
        : team,
    ),
  );
}

export function removeMessageTeam(ownerId: string, teamId: string) {
  writeMessageTeams(
    ownerId,
    readMessageTeams(ownerId).filter((team) => team.id !== teamId),
  );
  writeMessageThreads(
    ownerId,
    readMessageThreads(ownerId).map((thread) => ({
      ...thread,
      teamIds: (thread.teamIds ?? []).filter((id) => id !== teamId),
    })),
  );
}

export function appendThreadMessage(
  ownerId: string,
  threadId: string,
  input: { text: string; author: string },
) {
  const now = new Date().toISOString();
  const message: ThreadMessage = {
    id: crypto.randomUUID(),
    text: input.text.trim(),
    author: input.author,
    createdAt: now,
  };
  const threads = readMessageThreads(ownerId).map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          messages: [...thread.messages, message],
          updatedAt: now,
        }
      : thread,
  );
  writeMessageThreads(ownerId, threads);
  return message;
}

export function useMessageThreads(ownerId: string) {
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [people, setPeople] = useState<MessagePerson[]>([]);
  const [teams, setTeams] = useState<MessageTeam[]>([]);

  useEffect(() => {
    const load = () => {
      setThreads(readMessageThreads(ownerId));
      setPeople(readMessagePeople(ownerId));
      setTeams(readMessageTeams(ownerId));
    };
    queueMicrotask(load);
    window.addEventListener(MESSAGES_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(MESSAGES_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, [ownerId]);

  const create = useCallback(
    (input: {
      title: string;
      kind: ConversationKind;
      participantIds?: string[];
      teamIds?: string[];
    }) => createMessageThread(ownerId, input),
    [ownerId],
  );
  const send = useCallback(
    (threadId: string, input: { text: string; author: string }) =>
      appendThreadMessage(ownerId, threadId, input),
    [ownerId],
  );

  const updateThread = useCallback(
    (
      threadId: string,
      changes: { title: string; participantIds: string[]; teamIds: string[] },
    ) => updateMessageThread(ownerId, threadId, changes),
    [ownerId],
  );
  const removeThread = useCallback(
    (threadId: string) => removeMessageThread(ownerId, threadId),
    [ownerId],
  );
  const createPerson = useCallback(
    (input: { name: string; detail: string }) =>
      createMessagePerson(ownerId, input),
    [ownerId],
  );
  const updatePerson = useCallback(
    (personId: string, changes: { name: string; detail: string }) =>
      updateMessagePerson(ownerId, personId, changes),
    [ownerId],
  );
  const removePerson = useCallback(
    (personId: string) => removeMessagePerson(ownerId, personId),
    [ownerId],
  );
  const createTeam = useCallback(
    (input: { name: string; memberIds: string[] }) =>
      createMessageTeam(ownerId, input),
    [ownerId],
  );
  const updateTeam = useCallback(
    (teamId: string, changes: { name: string; memberIds: string[] }) =>
      updateMessageTeam(ownerId, teamId, changes),
    [ownerId],
  );
  const removeTeam = useCallback(
    (teamId: string) => removeMessageTeam(ownerId, teamId),
    [ownerId],
  );

  return {
    threads,
    people,
    teams,
    create,
    send,
    updateThread,
    removeThread,
    createPerson,
    updatePerson,
    removePerson,
    createTeam,
    updateTeam,
    removeTeam,
  };
}
