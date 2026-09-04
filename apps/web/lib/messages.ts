"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

export const conversationKinds = ["person", "team"] as const;
export type ConversationKind = (typeof conversationKinds)[number];

const messageSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(4000),
  author: z.string().min(1).max(100),
  createdAt: z.string().min(1),
});

const messageThreadSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(100),
  kind: z.enum(conversationKinds),
  messages: z.array(messageSchema).max(1000),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const messageThreadsSchema = z.array(messageThreadSchema).max(100);

export type MessageThread = z.infer<typeof messageThreadSchema>;
export type ThreadMessage = z.infer<typeof messageSchema>;

const STORAGE_PREFIX = "jarins-message-threads-v1";
export const MESSAGES_EVENT = "jarins-message-threads-changed";

export function messagesKey(ownerId: string) {
  return `${STORAGE_PREFIX}:${ownerId}`;
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

export function createMessageThread(
  ownerId: string,
  input: { title: string; kind: ConversationKind },
) {
  const now = new Date().toISOString();
  const thread: MessageThread = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    kind: input.kind,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  writeMessageThreads(ownerId, [thread, ...readMessageThreads(ownerId)]);
  return thread;
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

  useEffect(() => {
    const load = () => setThreads(readMessageThreads(ownerId));
    queueMicrotask(load);
    window.addEventListener(MESSAGES_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(MESSAGES_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, [ownerId]);

  const create = useCallback(
    (input: { title: string; kind: ConversationKind }) =>
      createMessageThread(ownerId, input),
    [ownerId],
  );
  const send = useCallback(
    (threadId: string, input: { text: string; author: string }) =>
      appendThreadMessage(ownerId, threadId, input),
    [ownerId],
  );

  return { threads, create, send };
}
