import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageAccount, StorageItem } from "@/lib/storage-accounts";
import { VaultHub } from "./vault-hub";

const account: StorageAccount = {
  id: "account-1",
  provider: "google-drive",
  address: "faria@example.com",
  label: "Family Drive",
  status: "active",
  accessMode: "manage",
  includeInSearch: true,
  rootProviderItemId: "root",
  lastSyncedAt: "2026-09-04T12:00:00.000Z",
  lastError: null,
  itemCount: 2,
};

const file: StorageItem = {
  id: "item-1",
  accountId: account.id,
  providerItemId: "provider-file-1",
  parentProviderItemId: "root",
  path: "Plan.pdf",
  name: "Plan.pdf",
  kind: "file",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  modifiedAt: "2026-09-04T12:00:00.000Z",
  webUrl: "https://drive.google.com/file/1",
  canDownload: true,
  canEdit: true,
};

const update = vi.fn();
const sync = vi.fn();
const removeAccount = vi.fn();

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ supabase: {}, status: "signed-in" }),
}));

vi.mock("@/lib/storage-accounts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/storage-accounts")>();
  return {
    ...actual,
    useStorageAccounts: () => ({
      accounts: [account],
      configuration: {
        encryption: true,
        googleDrive: true,
        onedrive: true,
        dropbox: true,
        webdav: true,
      },
      loading: false,
      error: "",
      load: vi.fn(),
      startOAuth: vi.fn(),
      connectWebDav: vi.fn(),
      update,
      sync,
      remove: removeAccount,
    }),
    useStorageItems: () => ({
      items: [file],
      loading: false,
      error: "",
      load: vi.fn(),
      createFolder: vi.fn(),
      rename: vi.fn(),
      remove: vi.fn(),
      upload: vi.fn(),
    }),
  };
});

describe("VAULT hub", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("renders synchronized files with provider-backed actions", () => {
    render(<VaultHub ownerId="user-1" />);

    expect(screen.getByRole("heading", { name: "VAULT" })).toBeTruthy();
    expect(screen.getByText("Plan.pdf")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Download Plan.pdf" })
        .getAttribute("href"),
    ).toBe("/api/storage/items/item-1/download");
    expect(
      screen
        .getByRole("link", { name: "Open Plan.pdf with provider" })
        .getAttribute("href"),
    ).toBe("https://drive.google.com/file/1");
  });

  it("exposes connection settings and sync for an account tab", async () => {
    render(<VaultHub ownerId="user-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Family Drive/ }));

    expect(await screen.findByText("Connected")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Sync now/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByLabelText("File access") as unknown as HTMLSelectElement)
        .value,
    ).toBe("manage");
  });
});
