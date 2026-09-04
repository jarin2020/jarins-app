"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";

export const storageProviders = [
  "google-drive",
  "onedrive",
  "dropbox",
  "webdav",
] as const;

export type StorageProvider = (typeof storageProviders)[number];
export type StorageAccessMode = "view" | "manage";
export type StorageConnectionStatus =
  "connecting" | "active" | "syncing" | "error";
export type StorageItemKind = "file" | "folder";

export type StorageAccount = {
  id: string;
  provider: StorageProvider;
  address: string;
  label: string;
  status: StorageConnectionStatus;
  accessMode: StorageAccessMode;
  includeInSearch: boolean;
  rootProviderItemId: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  itemCount: number;
};

export type StorageItem = {
  id: string;
  accountId: string;
  providerItemId: string;
  parentProviderItemId: string | null;
  path: string;
  name: string;
  kind: StorageItemKind;
  mimeType: string | null;
  sizeBytes: number | null;
  modifiedAt: string | null;
  webUrl: string | null;
  canDownload: boolean;
  canEdit: boolean;
};

export type StorageConfiguration = {
  encryption: boolean;
  googleDrive: boolean;
  onedrive: boolean;
  dropbox: boolean;
  webdav: boolean;
};

export type WebDavConnectionInput = {
  address: string;
  label: string;
  username: string;
  password: string;
  serverUrl: string;
  accessMode: StorageAccessMode;
  includeInSearch: boolean;
};

type ErrorPayload = { error?: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && typeof init.body === "string")
    headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers });
  const payload = (await response.json().catch(() => ({}))) as ErrorPayload & T;
  if (!response.ok)
    throw new Error(payload.error || "The storage request failed.");
  return payload;
}

export function useStorageAccounts(
  ownerId: string,
  supabase: SupabaseBrowserClient,
) {
  const [accounts, setAccounts] = useState<StorageAccount[]>([]);
  const [configuration, setConfiguration] =
    useState<StorageConfiguration | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      const result = await api<{
        accounts: StorageAccount[];
        configuration: StorageConfiguration;
      }>("/api/storage/accounts");
      setAccounts(result.accounts);
      setConfiguration(result.configuration);
      setError("");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Storage accounts could not load.",
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
      .channel(`storage-accounts:${ownerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "storage_accounts",
          filter: `user_id=eq.${ownerId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, ownerId, supabase]);

  const replace = useCallback((account: StorageAccount) => {
    setAccounts((current) => [
      account,
      ...current.filter((item) => item.id !== account.id),
    ]);
    return account;
  }, []);

  const startOAuth = useCallback(
    async (
      provider: Exclude<StorageProvider, "webdav">,
      input: {
        label: string;
        expectedAddress: string;
        accessMode: StorageAccessMode;
        includeInSearch: boolean;
      },
    ) => {
      const result = await api<{ url: string }>(
        `/api/storage/oauth/${provider}/start`,
        { method: "POST", body: JSON.stringify(input) },
      );
      window.location.assign(result.url);
    },
    [],
  );

  const connectWebDav = useCallback(
    async (input: WebDavConnectionInput) => {
      const result = await api<{ account: StorageAccount }>(
        "/api/storage/webdav",
        { method: "POST", body: JSON.stringify(input) },
      );
      return replace(result.account);
    },
    [replace],
  );

  const update = useCallback(
    async (
      accountId: string,
      changes: Partial<
        Pick<StorageAccount, "label" | "accessMode" | "includeInSearch">
      >,
    ) => {
      const result = await api<{ account: StorageAccount }>(
        `/api/storage/accounts/${accountId}`,
        { method: "PATCH", body: JSON.stringify(changes) },
      );
      return replace(result.account);
    },
    [replace],
  );

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
        const result = await api<{ account: StorageAccount }>(
          `/api/storage/accounts/${accountId}/sync`,
          { method: "POST" },
        );
        setError("");
        return replace(result.account);
      } catch (nextError) {
        const message =
          nextError instanceof Error
            ? nextError.message
            : "Storage sync failed.";
        setError(message);
        await load();
        throw nextError;
      }
    },
    [load, replace],
  );

  const remove = useCallback(async (accountId: string) => {
    const response = await fetch(`/api/storage/accounts/${accountId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as ErrorPayload;
      throw new Error(payload.error || "Storage could not be disconnected.");
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
    connectWebDav,
    update,
    sync,
    remove,
  };
}

export function useStorageItems(
  ownerId: string,
  supabase: SupabaseBrowserClient,
  filters: {
    accountId?: string;
    parentId?: string;
    query?: string;
    kind?: "all" | "documents" | "images";
    enabled?: boolean;
  },
) {
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");
  const { accountId, parentId, query, kind = "all", enabled = true } = filters;

  const load = useCallback(async () => {
    if (!supabase || !enabled) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    if (accountId) params.set("accountId", accountId);
    if (parentId !== undefined) params.set("parentId", parentId);
    if (query?.trim()) params.set("query", query.trim());
    if (kind !== "all") params.set("kind", kind);
    try {
      const result = await api<{ items: StorageItem[] }>(
        `/api/storage/items?${params}`,
      );
      setItems(result.items);
      setError("");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Files could not load.",
      );
    } finally {
      setLoading(false);
    }
  }, [accountId, enabled, kind, parentId, query, supabase]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    if (!supabase || !enabled || ownerId === "local") return;
    const channel = supabase
      .channel(`storage-items:${ownerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "storage_accounts",
          filter: `user_id=eq.${ownerId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, load, ownerId, supabase]);

  const createFolder = useCallback(
    async (targetAccountId: string, targetParentId: string, name: string) => {
      await api<{ item: StorageItem }>("/api/storage/items", {
        method: "POST",
        body: JSON.stringify({
          accountId: targetAccountId,
          parentProviderItemId: targetParentId,
          name,
        }),
      });
      await load();
    },
    [load],
  );

  const rename = useCallback(
    async (itemId: string, name: string) => {
      await api<{ item: StorageItem }>(`/api/storage/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (itemId: string) => {
      const response = await fetch(`/api/storage/items/${itemId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response
          .json()
          .catch(() => ({}))) as ErrorPayload;
        throw new Error(payload.error || "The item could not be removed.");
      }
      await load();
    },
    [load],
  );

  const upload = useCallback(
    async (
      targetAccountId: string,
      targetParentId: string,
      file: File,
      onProgress?: (percent: number) => void,
    ) => {
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open(
          "POST",
          `/api/storage/accounts/${targetAccountId}/upload?parentId=${encodeURIComponent(targetParentId)}&name=${encodeURIComponent(file.name)}&size=${file.size}`,
        );
        request.setRequestHeader(
          "Content-Type",
          file.type || "application/octet-stream",
        );
        request.upload.onprogress = (event) => {
          if (event.lengthComputable)
            onProgress?.(Math.round((event.loaded / event.total) * 100));
        };
        request.onerror = () =>
          reject(new Error("The upload was interrupted."));
        request.onload = () => {
          if (request.status >= 200 && request.status < 300) resolve();
          else {
            try {
              const payload = JSON.parse(request.responseText) as ErrorPayload;
              reject(
                new Error(payload.error || "The file could not be uploaded."),
              );
            } catch {
              reject(new Error("The file could not be uploaded."));
            }
          }
        };
        request.send(file);
      });
      await load();
    },
    [load],
  );

  return { items, loading, error, load, createFolder, rename, remove, upload };
}

export const storageProviderLabels: Record<StorageProvider, string> = {
  "google-drive": "Google Drive",
  onedrive: "Microsoft OneDrive",
  dropbox: "Dropbox",
  webdav: "WebDAV / custom",
};

export function formatStorageSize(size: number | null) {
  if (size === null) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}
