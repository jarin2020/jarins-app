"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

export const emailProviders = ["gmail", "outlook", "custom"] as const;
export type EmailProvider = (typeof emailProviders)[number];

const emailAccountSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(emailProviders),
  address: z.string().email(),
  label: z.string().min(1).max(80),
  imapHost: z.string().max(255).optional(),
  imapPort: z.number().int().min(1).max(65535).optional(),
  createdAt: z.string().min(1),
});

const emailAccountsSchema = z.array(emailAccountSchema).max(20);
export type EmailAccount = z.infer<typeof emailAccountSchema>;
export type NewEmailAccount = Omit<EmailAccount, "id" | "createdAt">;

const STORAGE_PREFIX = "jarins-email-accounts-v1";
export const EMAIL_ACCOUNTS_EVENT = "jarins-email-accounts-changed";

export function emailAccountsKey(ownerId: string) {
  return `${STORAGE_PREFIX}:${ownerId}`;
}

export function readEmailAccounts(ownerId: string): EmailAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = emailAccountsSchema.safeParse(
      JSON.parse(localStorage.getItem(emailAccountsKey(ownerId)) ?? "[]"),
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function writeEmailAccounts(ownerId: string, accounts: EmailAccount[]) {
  const parsed = emailAccountsSchema.parse(accounts);
  localStorage.setItem(emailAccountsKey(ownerId), JSON.stringify(parsed));
  window.dispatchEvent(new Event(EMAIL_ACCOUNTS_EVENT));
}

export function useEmailAccounts(ownerId: string) {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);

  useEffect(() => {
    const load = () => setAccounts(readEmailAccounts(ownerId));
    queueMicrotask(load);
    window.addEventListener(EMAIL_ACCOUNTS_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EMAIL_ACCOUNTS_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, [ownerId]);

  const add = useCallback(
    (input: NewEmailAccount) => {
      const current = readEmailAccounts(ownerId);
      const existing = current.find(
        (account) =>
          account.address.toLowerCase() === input.address.toLowerCase(),
      );
      if (existing) return existing;

      const account: EmailAccount = {
        ...input,
        address: input.address.trim().toLowerCase(),
        label: input.label.trim(),
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      writeEmailAccounts(ownerId, [...current, account]);
      return account;
    },
    [ownerId],
  );

  const remove = useCallback(
    (id: string) => {
      writeEmailAccounts(
        ownerId,
        readEmailAccounts(ownerId).filter((account) => account.id !== id),
      );
    },
    [ownerId],
  );

  return { accounts, add, remove };
}

export const emailProviderLabels: Record<EmailProvider, string> = {
  gmail: "Gmail",
  outlook: "Outlook / Hotmail",
  custom: "Custom domain",
};
