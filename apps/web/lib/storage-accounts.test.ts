import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readStorageAccounts,
  STORAGE_ACCOUNTS_EVENT,
  storageAccountsKey,
  type StorageAccount,
  writeStorageAccounts,
} from "./storage-accounts";

const account: StorageAccount = {
  id: "storage-1",
  provider: "google-drive",
  address: "faria@example.com",
  label: "Family Drive",
  accessMode: "manage",
  includeInSearch: true,
  createdAt: "2026-09-04T12:00:00.000Z",
};

describe("storage account persistence", () => {
  beforeEach(() => localStorage.clear());

  it("keeps connected storage scoped to the current account", () => {
    writeStorageAccounts("user-a", [account]);
    expect(readStorageAccounts("user-a")).toEqual([account]);
    expect(readStorageAccounts("user-b")).toEqual([]);
    expect(storageAccountsKey("user-a")).not.toBe(storageAccountsKey("user-b"));
  });

  it("rejects malformed saved connection data", () => {
    localStorage.setItem(storageAccountsKey("user-a"), JSON.stringify([{}]));
    expect(readStorageAccounts("user-a")).toEqual([]);
  });

  it("announces storage connection changes", () => {
    const listener = vi.fn();
    window.addEventListener(STORAGE_ACCOUNTS_EVENT, listener);
    writeStorageAccounts("user-a", [account]);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(STORAGE_ACCOUNTS_EVENT, listener);
  });
});
