"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import {
  calendarProviderLabels,
  calendarProviders,
  type CalendarAccount,
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarProvider,
  type CalendarSyncMode,
} from "@/lib/calendar";

export { calendarProviderLabels, calendarProviders };
export type {
  CalendarAccount,
  CalendarEvent,
  CalendarEventInput,
  CalendarProvider,
  CalendarSyncMode,
};

export type CalendarConfiguration = {
  encryption: boolean;
  google: boolean;
  microsoft: boolean;
  apple: boolean;
  caldav: boolean;
};

export type CalDavConnectionInput = {
  provider: "apple" | "caldav";
  address: string;
  label: string;
  username: string;
  password: string;
  serverUrl: string;
  syncMode: CalendarSyncMode;
  included: boolean;
  shareWithHousehold: boolean;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok)
    throw new Error(payload.error || "Calendar request failed.");
  return payload;
}

export function useCalendarAccounts(
  ownerId: string,
  supabase: SupabaseBrowserClient,
) {
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [configuration, setConfiguration] =
    useState<CalendarConfiguration | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      const data = await api<{
        accounts: CalendarAccount[];
        configuration: CalendarConfiguration;
      }>("/api/calendar/accounts");
      setAccounts(data.accounts);
      setConfiguration(data.configuration);
      setError("");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Calendars could not load.",
      );
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    if (!supabase || ownerId === "local") return;
    const channel = supabase
      .channel(`calendar-accounts:${ownerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calendar_accounts",
          filter: `user_id=eq.${ownerId}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calendar_sources",
          filter: `user_id=eq.${ownerId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, ownerId, supabase]);

  const replaceAccount = useCallback((account: CalendarAccount) => {
    setAccounts((current) => [
      account,
      ...current.filter((item) => item.id !== account.id),
    ]);
    return account;
  }, []);

  const startOAuth = useCallback(
    async (
      provider: "google" | "microsoft",
      input: {
        label: string;
        expectedAddress: string;
        syncMode: CalendarSyncMode;
        included: boolean;
        shareWithHousehold: boolean;
      },
    ) => {
      const data = await api<{ url: string }>(
        `/api/calendar/oauth/${provider}/start`,
        { method: "POST", body: JSON.stringify(input) },
      );
      window.location.assign(data.url);
    },
    [],
  );

  const connectCalDav = useCallback(
    async (input: CalDavConnectionInput) => {
      const data = await api<{ account: CalendarAccount }>(
        "/api/calendar/caldav",
        { method: "POST", body: JSON.stringify(input) },
      );
      return replaceAccount(data.account);
    },
    [replaceAccount],
  );

  const update = useCallback(
    async (
      accountId: string,
      changes: Partial<
        Pick<
          CalendarAccount,
          "label" | "included" | "syncMode" | "shareWithHousehold"
        >
      >,
    ) => {
      const data = await api<{ account: CalendarAccount }>(
        `/api/calendar/accounts/${accountId}`,
        { method: "PATCH", body: JSON.stringify(changes) },
      );
      return replaceAccount(data.account);
    },
    [replaceAccount],
  );

  const updateSource = useCallback(
    async (accountId: string, sourceId: string, selected: boolean) => {
      const data = await api<{ account: CalendarAccount }>(
        `/api/calendar/accounts/${accountId}/sources/${sourceId}`,
        { method: "PATCH", body: JSON.stringify({ selected }) },
      );
      return replaceAccount(data.account);
    },
    [replaceAccount],
  );

  const sync = useCallback(
    async (accountId: string) => {
      setAccounts((current) =>
        current.map((account) =>
          account.id === accountId
            ? { ...account, status: "syncing" as const }
            : account,
        ),
      );
      try {
        const data = await api<{ account: CalendarAccount }>(
          `/api/calendar/accounts/${accountId}/sync`,
          { method: "POST" },
        );
        setError("");
        return replaceAccount(data.account);
      } catch (nextError) {
        const message =
          nextError instanceof Error
            ? nextError.message
            : "Calendar sync failed.";
        setError(message);
        await load();
        throw nextError;
      }
    },
    [load, replaceAccount],
  );

  const remove = useCallback(async (accountId: string) => {
    const response = await fetch(`/api/calendar/accounts/${accountId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(payload.error || "Calendar could not be disconnected.");
    }
    setAccounts((current) =>
      current.filter((account) => account.id !== accountId),
    );
  }, []);

  return {
    accounts,
    configuration,
    loading,
    error,
    load,
    startOAuth,
    connectCalDav,
    update,
    updateSource,
    sync,
    remove,
  };
}

export function useCalendarEvents(
  ownerId: string,
  supabase: SupabaseBrowserClient,
) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      const data = await api<{ events: CalendarEvent[] }>(
        "/api/calendar/events",
      );
      setEvents(data.events);
      setError("");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Events could not load.",
      );
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    if (!supabase || ownerId === "local") return;
    const channel = supabase
      .channel(`calendar-events:${ownerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_events" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, ownerId, supabase]);

  const create = useCallback(async (input: CalendarEventInput) => {
    const data = await api<{ event: CalendarEvent }>("/api/calendar/events", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setEvents((current) =>
      [...current.filter((item) => item.id !== data.event.id), data.event].sort(
        (a, b) => a.startsAt.localeCompare(b.startsAt),
      ),
    );
    return data.event;
  }, []);

  const updateEvent = useCallback(
    async (eventId: string, input: CalendarEventInput) => {
      const data = await api<{ event: CalendarEvent }>(
        `/api/calendar/events/${eventId}`,
        { method: "PATCH", body: JSON.stringify(input) },
      );
      setEvents((current) =>
        current.map((item) => (item.id === eventId ? data.event : item)),
      );
      return data.event;
    },
    [],
  );

  const remove = useCallback(async (eventId: string) => {
    const response = await fetch(`/api/calendar/events/${eventId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(payload.error || "Event could not be deleted.");
    }
    setEvents((current) => current.filter((event) => event.id !== eventId));
  }, []);

  return {
    events,
    loading,
    error,
    load,
    create,
    update: updateEvent,
    remove,
  };
}
