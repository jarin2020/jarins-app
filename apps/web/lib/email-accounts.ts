"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import {
  emailProviderLabels,
  emailProviders,
  type EmailAccount,
  type EmailMessage,
  type EmailProvider,
} from "@/lib/email";

export { emailProviderLabels, emailProviders };
export type { EmailAccount, EmailProvider };

export type EmailConfiguration = {
  encryption: boolean;
  gmail: boolean;
  outlook: boolean;
  custom: boolean;
};

export type CustomEmailInput = {
  address: string;
  label: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok) throw new Error(payload.error || "Email request failed.");
  return payload;
}

export function useEmailAccounts(
  ownerId: string,
  supabase: SupabaseBrowserClient,
) {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [configuration, setConfiguration] = useState<EmailConfiguration | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      const data = await api<{
        accounts: EmailAccount[];
        configuration: EmailConfiguration;
      }>("/api/email/accounts");
      setAccounts(data.accounts);
      setConfiguration(data.configuration);
      setError("");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Email could not load.",
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
      .channel(`email-accounts:${ownerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "email_accounts",
          filter: `user_id=eq.${ownerId}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "email_messages",
          filter: `user_id=eq.${ownerId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, ownerId, supabase]);

  const startOAuth = useCallback(
    async (
      provider: Exclude<EmailProvider, "custom">,
      label: string,
      expectedAddress: string,
    ) => {
      const data = await api<{ url: string }>(
        `/api/email/oauth/${provider}/start`,
        {
          method: "POST",
          body: JSON.stringify({ label, expectedAddress }),
        },
      );
      window.location.assign(data.url);
    },
    [],
  );

  const connectCustom = useCallback(async (input: CustomEmailInput) => {
    const data = await api<{ account: EmailAccount }>("/api/email/custom", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setAccounts((current) => [
      data.account,
      ...current.filter((account) => account.id !== data.account.id),
    ]);
    return data.account;
  }, []);

  const sync = useCallback(
    async (accountId: string) => {
      setAccounts((current) =>
        current.map((account) =>
          account.id === accountId
            ? { ...account, status: "syncing" }
            : account,
        ),
      );
      try {
        const data = await api<{ account: EmailAccount }>(
          `/api/email/accounts/${accountId}/sync`,
          { method: "POST" },
        );
        setAccounts((current) =>
          current.map((account) =>
            account.id === accountId ? data.account : account,
          ),
        );
        setError("");
        return data.account;
      } catch (nextError) {
        const message =
          nextError instanceof Error
            ? nextError.message
            : "Mailbox sync failed.";
        setError(message);
        await load();
        throw nextError;
      }
    },
    [load],
  );

  const remove = useCallback(async (accountId: string) => {
    const response = await fetch(`/api/email/accounts/${accountId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(payload.error || "Mailbox could not be disconnected.");
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
    connectCustom,
    sync,
    remove,
  };
}

export function useEmailMessages(
  accountId: string | null,
  ownerId: string,
  supabase: SupabaseBrowserClient,
) {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!accountId || !supabase) {
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api<{ messages: EmailMessage[] }>(
        `/api/email/accounts/${accountId}/messages`,
      );
      setMessages(data.messages);
      setError("");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Messages could not load.",
      );
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    if (!accountId || !supabase || ownerId === "local") return;
    const channel = supabase
      .channel(`email-messages:${accountId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "email_messages",
          filter: `account_id=eq.${accountId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [accountId, load, ownerId, supabase]);

  return { messages, setMessages, loading, error, load };
}
