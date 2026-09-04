"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

export const storageProviders = [
  "google-drive",
  "onedrive",
  "dropbox",
  "webdav",
] as const;
export type StorageProvider = (typeof storageProviders)[number];
export type StorageAccessMode = "view" | "manage";

const storageAccountSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(storageProviders),
  address: z.string().min(1).max(255),
  label: z.string().min(1).max(80),
  accessMode: z.enum(["view", "manage"]),
  includeInSearch: z.boolean(),
  createdAt: z.string().min(1),
});

const storageAccountsSchema = z.array(storageAccountSchema).max(20);
export type StorageAccount = z.infer<typeof storageAccountSchema>;
export type NewStorageAccount = Omit<StorageAccount, "id" | "createdAt">;

const STORAGE_PREFIX = "jarins-storage-accounts-v1";
export const STORAGE_ACCOUNTS_EVENT = "jarins-storage-accounts-changed";

export function storageAccountsKey(ownerId: string) {
  return `${STORAGE_PREFIX}:${ownerId}`;
}

export function readStorageAccounts(ownerId: string): StorageAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = storageAccountsSchema.safeParse(
      JSON.parse(localStorage.getItem(storageAccountsKey(ownerId)) ?? "[]"),
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function writeStorageAccounts(
  ownerId: string,
  accounts: StorageAccount[],
) {
  const parsed = storageAccountsSchema.parse(accounts);
  localStorage.setItem(storageAccountsKey(ownerId), JSON.stringify(parsed));
  window.dispatchEvent(new Event(STORAGE_ACCOUNTS_EVENT));
}

export function useStorageAccounts(ownerId: string) {
  const [accounts, setAccounts] = useState<StorageAccount[]>([]);

  useEffect(() => {
    const load = () => setAccounts(readStorageAccounts(ownerId));
    queueMicrotask(load);
    window.addEventListener(STORAGE_ACCOUNTS_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(STORAGE_ACCOUNTS_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, [ownerId]);

  const add = useCallback(
    (input: NewStorageAccount) => {
      const current = readStorageAccounts(ownerId);
      const existing = current.find(
        (account) =>
          account.provider === input.provider &&
          account.address.toLowerCase() === input.address.toLowerCase(),
      );
      if (existing) return existing;
      const account: StorageAccount = {
        ...input,
        address: input.address.trim(),
        label: input.label.trim(),
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      writeStorageAccounts(ownerId, [...current, account]);
      return account;
    },
    [ownerId],
  );

  const update = useCallback(
    (
      id: string,
      changes: Pick<StorageAccount, "accessMode" | "includeInSearch">,
    ) => {
      writeStorageAccounts(
        ownerId,
        readStorageAccounts(ownerId).map((account) =>
          account.id === id ? { ...account, ...changes } : account,
        ),
      );
    },
    [ownerId],
  );

  const remove = useCallback(
    (id: string) => {
      writeStorageAccounts(
        ownerId,
        readStorageAccounts(ownerId).filter((account) => account.id !== id),
      );
    },
    [ownerId],
  );

  return { accounts, add, update, remove };
}

export const storageProviderLabels: Record<StorageProvider, string> = {
  "google-drive": "Google Drive",
  onedrive: "Microsoft OneDrive",
  dropbox: "Dropbox",
  webdav: "WebDAV / custom",
};
