import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LifeRecord } from "@/lib/jarins-store";
import { DocumentsDashboard } from "./documents-dashboard";

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    supabase: {},
    user: { id: "owner-1" },
    status: "signed-in",
  }),
}));

vi.mock("@/lib/storage-accounts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/storage-accounts")>();
  return {
    ...actual,
    useStorageAccounts: () => ({
      accounts: [
        {
          id: "drive-1",
          provider: "google-drive",
          status: "active",
          itemCount: 24,
        },
      ],
      loading: false,
      error: "",
    }),
    useStorageItems: () => ({
      items: [
        {
          id: "file-1",
          accountId: "drive-1",
          name: "Passport scan.pdf",
          kind: "file",
          canDownload: true,
          sizeBytes: 2048,
        },
      ],
      error: "",
    }),
  };
});

function dateFromToday(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const records: LifeRecord[] = [
  {
    id: "passport",
    module: "documents",
    kind: "Identity",
    title: "Passport renewal",
    detail: "Sensitive identity document",
    date: dateFromToday(14),
    status: "open",
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  },
  {
    id: "certificate",
    module: "documents",
    kind: "Certificate",
    title: "Language certificate",
    detail: "Normal record",
    status: "done",
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
  },
];

describe("Documents dashboard", () => {
  afterEach(cleanup);

  it("summarizes expiry actions, categories, and connected VAULT files", () => {
    render(
      <DocumentsDashboard records={records} loading={false} update={vi.fn()} />,
    );

    expect(screen.getAllByText("Passport renewal")).toHaveLength(2);
    expect(screen.getByText("Passport scan.pdf")).toBeTruthy();
    expect(screen.getByText("Identity")).toBeTruthy();
    expect(screen.getByText("24")).toBeTruthy();
    expect(screen.getByText("Files stay with their provider")).toBeTruthy();
  });

  it("opens capture and marks an expiry action handled", () => {
    const capture = vi.fn();
    const update = vi.fn().mockResolvedValue(undefined);
    window.addEventListener("jarins-open-capture", capture);
    render(
      <DocumentsDashboard records={records} loading={false} update={update} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Add document record/i }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Mark Passport renewal handled",
      }),
    );

    expect(capture).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith("passport", {
      status: "done",
      progress: 100,
    });
    window.removeEventListener("jarins-open-capture", capture);
  });
});
