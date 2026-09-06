import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FamilyCalendarRoute, FamilyOverview } from "./family-overview";

const mocks = vi.hoisted(() => ({
  canManage: true,
  invite: vi.fn(),
  revokeInvitation: vi.fn(),
  updateRole: vi.fn(),
  remove: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    supabase: {},
    user: { id: "owner-1" },
    householdId: "household-1",
    status: "signed-in",
  }),
}));

vi.mock("@/lib/preferences-store", () => ({
  usePreferences: () => ({
    preferences: { household: "Jarin household", name: "Faria" },
  }),
}));

vi.mock("@/components/family-calendar", () => ({
  FamilyCalendar: ({
    householdMembers,
  }: {
    householdMembers: { id: string; name: string }[];
  }) => (
    <div>
      {householdMembers.map((member) => (
        <span key={member.id}>Calendar member: {member.name}</span>
      ))}
    </div>
  ),
}));

vi.mock("@/lib/household-members", () => ({
  useHouseholdMembers: () => ({
    members: [
      {
        userId: "owner-1",
        displayName: "Faria Jarin",
        email: "faria@example.com",
        role: "owner",
      },
      {
        userId: "adult-2",
        displayName: "Sam Jarin",
        email: "sam@example.com",
        role: "adult",
      },
    ],
    invitations: [
      {
        id: "invite-1",
        email: "pending@example.com",
        role: "viewer",
        expiresAt: "2026-09-11T10:00:00.000Z",
      },
    ],
    loading: false,
    error: "",
    canManage: mocks.canManage,
    invite: mocks.invite,
    revokeInvitation: mocks.revokeInvitation,
    updateRole: mocks.updateRole,
    remove: mocks.remove,
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/calendar-accounts", () => ({
  useCalendarEvents: () => ({
    events: [
      {
        id: "event-1",
        ownerUserId: "adult-2",
        ownerName: "Sam Jarin",
        sourceName: "Shared calendar",
        title: "School meeting",
        startsAt: "2099-09-06T09:00:00.000Z",
        endsAt: "2099-09-06T10:00:00.000Z",
        sharedWithHousehold: true,
      },
    ],
    loading: false,
    error: "",
  }),
}));

vi.mock("@/lib/email-accounts", () => ({
  useEmailAccounts: () => ({
    accounts: [
      {
        id: "email-1",
        label: "Personal Gmail",
        address: "faria@example.com",
        status: "active",
      },
    ],
    loading: false,
    error: "",
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
          id: "storage-1",
          provider: "google-drive",
          label: "Family Drive",
          status: "active",
          itemCount: 12,
        },
      ],
      loading: false,
      error: "",
    }),
    useStorageItems: () => ({
      items: [
        {
          id: "file-1",
          accountId: "storage-1",
          name: "Family documents",
          kind: "folder",
        },
      ],
      loading: false,
      error: "",
    }),
  };
});

describe("Family overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canManage = true;
    mocks.invite.mockResolvedValue("https://jarins.com/invite/token");
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ sent: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows members, pending invitations, calendar, and Family VAULT", () => {
    render(<FamilyOverview records={[]} />);

    expect(screen.getByText("Faria Jarin")).toBeTruthy();
    expect(screen.getByText("Sam Jarin")).toBeTruthy();
    expect(screen.getByText("pending@example.com")).toBeTruthy();
    expect(screen.getByText("School meeting")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Family VAULT" })).toBeTruthy();
    expect(screen.getByText("Family documents")).toBeTruthy();
  });

  it("puts every verified account into the Family calendar", () => {
    render(<FamilyCalendarRoute records={[]} />);

    expect(screen.getByText("Calendar member: Faria Jarin")).toBeTruthy();
    expect(screen.getByText("Calendar member: Sam Jarin")).toBeTruthy();
  });

  it("creates and sends an email invitation from a connected mailbox", async () => {
    render(<FamilyOverview records={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add family member" }));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "newmember@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Send from"), {
      target: { value: "email-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() =>
      expect(mocks.invite).toHaveBeenCalledWith(
        "newmember@example.com",
        "adult",
      ),
    );
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/email/accounts/email-1/send",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(
      await screen.findByText("Invitation emailed to newmember@example.com."),
    ).toBeTruthy();
  });

  // The reported problem: "Invite by email" only ever produced a link to copy,
  // because sending was conditional on a personal mailbox being connected.
  it("defaults to Jarins' own mailbox and sends without a connected account", async () => {
    mocks.fetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/family/invitations" && !init)
        return Promise.resolve(
          Response.json({ address: "Jarins <invites@jarins.com>" }),
        );
      if (url === "/api/family/invitations")
        return Promise.resolve(
          Response.json({
            link: "https://jarins.com/auth/invite/token",
            sent: true,
            from: "Jarins <invites@jarins.com>",
          }),
        );
      return Promise.resolve(Response.json({ sent: true }));
    });

    render(<FamilyOverview records={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add family member" }));

    // The option exists, and the button already reads "Send invitation" —
    // which it only does once a sender is selected, so the default moved off
    // link-only without anyone touching the dropdown.
    expect(
      await screen.findByRole("option", {
        name: "Jarins · Jarins <invites@jarins.com>",
      }),
    ).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: "Send invitation" }),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "newmember@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/family/invitations",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    // The token is minted server-side, so the old two-step call must not run.
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Invitation emailed to newmember@example.com/),
    ).toBeTruthy();
  });

  // Delivery failing must not read as "nothing happened": the invitation is
  // real and its link is still the way in.
  it("still shows the link when Jarins cannot deliver the mail", async () => {
    mocks.fetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/family/invitations" && !init)
        return Promise.resolve(
          Response.json({ address: "invites@jarins.com" }),
        );
      if (url === "/api/family/invitations")
        return Promise.resolve(
          Response.json({
            link: "https://jarins.com/auth/invite/token",
            sent: false,
            error: "The invitation was created, but it could not be sent.",
          }),
        );
      return Promise.resolve(Response.json({ sent: true }));
    });

    render(<FamilyOverview records={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add family member" }));
    await screen.findByRole("button", { name: "Send invitation" });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "newmember@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText(/could not be sent/)).toBeTruthy();
    expect(
      (screen.getByLabelText("Family invitation link") as HTMLInputElement)
        .value,
    ).toBe("https://jarins.com/auth/invite/token");
  });

  it("keeps the invitation entry point visible while owner access is unresolved", () => {
    mocks.canManage = false;

    render(<FamilyOverview records={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add family member" }));
    expect(screen.getByLabelText("Email address")).toBeTruthy();
  });
});
