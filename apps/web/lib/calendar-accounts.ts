"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

export const calendarProviders = [
  "google",
  "microsoft",
  "apple",
  "caldav",
] as const;
export type CalendarProvider = (typeof calendarProviders)[number];
export type CalendarSyncMode = "two-way" | "read-only";

const calendarAccountSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(calendarProviders),
  address: z.string().min(1).max(255),
  label: z.string().min(1).max(80),
  syncMode: z.enum(["two-way", "read-only"]),
  included: z.boolean(),
  createdAt: z.string().min(1),
});

const calendarAccountsSchema = z.array(calendarAccountSchema).max(20);
export type CalendarAccount = z.infer<typeof calendarAccountSchema>;
export type NewCalendarAccount = Omit<
  CalendarAccount,
  "id" | "included" | "createdAt"
>;

const STORAGE_PREFIX = "jarins-calendar-accounts-v1";
export const CALENDAR_ACCOUNTS_EVENT = "jarins-calendar-accounts-changed";

export function calendarAccountsKey(ownerId: string) {
  return `${STORAGE_PREFIX}:${ownerId}`;
}

export function readCalendarAccounts(ownerId: string): CalendarAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = calendarAccountsSchema.safeParse(
      JSON.parse(localStorage.getItem(calendarAccountsKey(ownerId)) ?? "[]"),
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function writeCalendarAccounts(
  ownerId: string,
  accounts: CalendarAccount[],
) {
  const parsed = calendarAccountsSchema.parse(accounts);
  localStorage.setItem(calendarAccountsKey(ownerId), JSON.stringify(parsed));
  window.dispatchEvent(new Event(CALENDAR_ACCOUNTS_EVENT));
}

export function useCalendarAccounts(ownerId: string) {
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);

  useEffect(() => {
    const load = () => setAccounts(readCalendarAccounts(ownerId));
    queueMicrotask(load);
    window.addEventListener(CALENDAR_ACCOUNTS_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(CALENDAR_ACCOUNTS_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, [ownerId]);

  const add = useCallback(
    (input: NewCalendarAccount) => {
      const current = readCalendarAccounts(ownerId);
      const existing = current.find(
        (account) =>
          account.provider === input.provider &&
          account.address.toLowerCase() === input.address.toLowerCase(),
      );
      if (existing) return existing;

      const account: CalendarAccount = {
        ...input,
        address: input.address.trim(),
        label: input.label.trim(),
        included: true,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      writeCalendarAccounts(ownerId, [...current, account]);
      return account;
    },
    [ownerId],
  );

  const update = useCallback(
    (id: string, changes: Pick<CalendarAccount, "included" | "syncMode">) => {
      writeCalendarAccounts(
        ownerId,
        readCalendarAccounts(ownerId).map((account) =>
          account.id === id ? { ...account, ...changes } : account,
        ),
      );
    },
    [ownerId],
  );

  const remove = useCallback(
    (id: string) => {
      writeCalendarAccounts(
        ownerId,
        readCalendarAccounts(ownerId).filter((account) => account.id !== id),
      );
    },
    [ownerId],
  );

  return { accounts, add, update, remove };
}

export const calendarProviderLabels: Record<CalendarProvider, string> = {
  google: "Google Calendar",
  microsoft: "Microsoft Calendar",
  apple: "Apple Calendar",
  caldav: "CalDAV / custom",
};
