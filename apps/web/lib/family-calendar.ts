"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

export const familyMemberColors = [
  "sage",
  "coral",
  "blue",
  "gold",
  "plum",
] as const;
export type FamilyMemberColor = (typeof familyMemberColors)[number];

const familyMemberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  relationship: z.string().max(60),
  color: z.enum(familyMemberColors),
  visible: z.boolean(),
  isOwner: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const familyEventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(160),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  memberIds: z.array(z.string().min(1)).max(30),
  location: z.string().max(160),
  notes: z.string().max(1000),
  sharedWithEveryone: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const familyCalendarSchema = z.object({
  members: z.array(familyMemberSchema).max(30),
  events: z.array(familyEventSchema).max(500),
});

export type FamilyMember = z.infer<typeof familyMemberSchema>;
export type FamilyCalendarEvent = z.infer<typeof familyEventSchema>;
export type NewFamilyEvent = Omit<
  FamilyCalendarEvent,
  "id" | "createdAt" | "updatedAt"
>;

const STORAGE_PREFIX = "jarins-family-calendar-v1";
export const FAMILY_CALENDAR_EVENT = "jarins-family-calendar-changed";

export function familyCalendarKey(ownerId: string) {
  return `${STORAGE_PREFIX}:${ownerId}`;
}

export function readFamilyCalendar(ownerId: string) {
  if (typeof window === "undefined") return { members: [], events: [] };
  try {
    const parsed = familyCalendarSchema.safeParse(
      JSON.parse(localStorage.getItem(familyCalendarKey(ownerId)) ?? "{}"),
    );
    return parsed.success ? parsed.data : { members: [], events: [] };
  } catch {
    return { members: [], events: [] };
  }
}

export function writeFamilyCalendar(
  ownerId: string,
  value: { members: FamilyMember[]; events: FamilyCalendarEvent[] },
) {
  const parsed = familyCalendarSchema.parse(value);
  localStorage.setItem(familyCalendarKey(ownerId), JSON.stringify(parsed));
  window.dispatchEvent(new Event(FAMILY_CALENDAR_EVENT));
}

export function ensureOwnerMember(ownerId: string, ownerName: string) {
  const current = readFamilyCalendar(ownerId);
  const owner = current.members.find((member) => member.isOwner);
  if (owner) return owner;
  const now = new Date().toISOString();
  const member: FamilyMember = {
    id: crypto.randomUUID(),
    name: ownerName.trim() || "Me",
    relationship: "You",
    color: "sage",
    visible: true,
    isOwner: true,
    createdAt: now,
    updatedAt: now,
  };
  writeFamilyCalendar(ownerId, {
    ...current,
    members: [member, ...current.members],
  });
  return member;
}

export function useFamilyCalendar(ownerId: string, ownerName: string) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [events, setEvents] = useState<FamilyCalendarEvent[]>([]);

  useEffect(() => {
    const load = () => {
      const next = readFamilyCalendar(ownerId);
      if (!next.members.some((member) => member.isOwner)) {
        ensureOwnerMember(ownerId, ownerName);
        return;
      }
      setMembers(next.members);
      setEvents(next.events);
    };
    queueMicrotask(load);
    window.addEventListener(FAMILY_CALENDAR_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(FAMILY_CALENDAR_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, [ownerId, ownerName]);

  const mutate = useCallback(
    (
      change: (current: ReturnType<typeof readFamilyCalendar>) => {
        members: FamilyMember[];
        events: FamilyCalendarEvent[];
      },
    ) => writeFamilyCalendar(ownerId, change(readFamilyCalendar(ownerId))),
    [ownerId],
  );

  const addMember = useCallback(
    (input: {
      name: string;
      relationship: string;
      color: FamilyMemberColor;
    }) => {
      const now = new Date().toISOString();
      const member: FamilyMember = {
        ...input,
        id: crypto.randomUUID(),
        name: input.name.trim(),
        relationship: input.relationship.trim(),
        visible: true,
        isOwner: false,
        createdAt: now,
        updatedAt: now,
      };
      mutate((current) => ({
        ...current,
        members: [...current.members, member],
      }));
      return member;
    },
    [mutate],
  );

  const updateMember = useCallback(
    (
      id: string,
      changes: Partial<
        Pick<FamilyMember, "name" | "relationship" | "color" | "visible">
      >,
    ) =>
      mutate((current) => ({
        ...current,
        members: current.members.map((member) =>
          member.id === id
            ? { ...member, ...changes, updatedAt: new Date().toISOString() }
            : member,
        ),
      })),
    [mutate],
  );

  const removeMember = useCallback(
    (id: string) =>
      mutate((current) => ({
        members: current.members.filter(
          (member) => member.id !== id || member.isOwner,
        ),
        events: current.events
          .map((event) => ({
            ...event,
            memberIds: event.memberIds.filter((memberId) => memberId !== id),
          }))
          .filter(
            (event) => event.sharedWithEveryone || event.memberIds.length,
          ),
      })),
    [mutate],
  );

  const addEvent = useCallback(
    (input: NewFamilyEvent) => {
      const now = new Date().toISOString();
      const item: FamilyCalendarEvent = {
        ...input,
        id: crypto.randomUUID(),
        title: input.title.trim(),
        location: input.location.trim(),
        notes: input.notes.trim(),
        createdAt: now,
        updatedAt: now,
      };
      mutate((current) => ({
        ...current,
        events: [...current.events, item],
      }));
      return item;
    },
    [mutate],
  );

  const updateEvent = useCallback(
    (id: string, changes: Partial<NewFamilyEvent>) =>
      mutate((current) => ({
        ...current,
        events: current.events.map((event) =>
          event.id === id
            ? { ...event, ...changes, updatedAt: new Date().toISOString() }
            : event,
        ),
      })),
    [mutate],
  );

  const removeEvent = useCallback(
    (id: string) =>
      mutate((current) => ({
        ...current,
        events: current.events.filter((event) => event.id !== id),
      })),
    [mutate],
  );

  return {
    members,
    events,
    addMember,
    updateMember,
    removeMember,
    addEvent,
    updateEvent,
    removeEvent,
  };
}
