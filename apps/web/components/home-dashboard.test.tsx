import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LifeRecord } from "@/lib/jarins-store";
import { HomeDashboard } from "./home-dashboard";

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    supabase: {},
    user: { id: "owner-1" },
    householdId: "household-1",
    status: "signed-in",
  }),
}));

vi.mock("@/lib/email-accounts", () => ({
  useEmailAccounts: () => ({
    accounts: [{ id: "email-1", unreadCount: 4, status: "active" }],
    error: "",
  }),
}));

vi.mock("@/lib/calendar-accounts", () => ({
  useCalendarAccounts: () => ({
    accounts: [{ id: "calendar-1", status: "active" }],
    error: "",
  }),
  useCalendarEvents: () => ({
    events: [
      {
        id: "event-1",
        title: "Family appointment",
        startsAt: "2099-09-08T09:00:00.000Z",
        endsAt: "2099-09-08T10:00:00.000Z",
        ownerName: "Faria",
        sourceName: "Family calendar",
      },
    ],
    error: "",
  }),
}));

vi.mock("@/lib/storage-accounts", () => ({
  useStorageAccounts: () => ({
    accounts: [{ id: "drive-1", status: "active", itemCount: 12 }],
    error: "",
  }),
  useStorageItems: () => ({
    items: [{ id: "file-1", name: "Document" }],
    error: "",
  }),
}));

vi.mock("@/lib/household-members", () => ({
  useHouseholdMembers: () => ({
    members: [{ userId: "owner-1" }, { userId: "adult-2" }],
    loading: false,
    error: "",
  }),
}));

const records: LifeRecord[] = [
  {
    id: "task-1",
    module: "career",
    kind: "Task",
    title: "Send application",
    detail: "Finish the cover letter",
    date: "2099-09-04",
    status: "open",
    essential: true,
    createdAt: "2099-09-01T10:00:00.000Z",
    updatedAt: "2099-09-01T10:00:00.000Z",
  },
  {
    id: "note-1",
    module: "family",
    kind: "Memory",
    title: "First school day",
    detail: "Save the photo",
    status: "open",
    createdAt: "2099-09-01T10:00:00.000Z",
    updatedAt: "2099-09-01T10:00:00.000Z",
  },
];

describe("Home dashboard", () => {
  afterEach(cleanup);

  it("summarizes actions, services, modules, and the connected schedule", () => {
    render(
      <HomeDashboard records={records} loading={false} update={vi.fn()} />,
    );

    expect(screen.getByText("What needs attention")).toBeTruthy();
    expect(screen.getAllByText("Send application")).toHaveLength(2);
    expect(screen.getByText("Family appointment")).toBeTruthy();
    expect(screen.getByText("4 unread emails")).toBeTruthy();
    expect(screen.getByText("System overview")).toBeTruthy();
    expect(screen.getByText("Run the home")).toBeTruthy();
  });

  it("executes capture, messages, and completion actions", () => {
    const capture = vi.fn();
    const messages = vi.fn();
    const update = vi.fn().mockResolvedValue(undefined);
    window.addEventListener("jarins-open-capture", capture);
    window.addEventListener("jarins-open-messages", messages);

    render(<HomeDashboard records={records} loading={false} update={update} />);
    fireEvent.click(screen.getByRole("button", { name: /quick capture/i }));
    fireEvent.click(screen.getByRole("button", { name: /messages/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete Send application" }),
    );

    expect(capture).toHaveBeenCalledOnce();
    expect(messages).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith("task-1", {
      status: "done",
      progress: 100,
    });
    window.removeEventListener("jarins-open-capture", capture);
    window.removeEventListener("jarins-open-messages", messages);
  });
});
