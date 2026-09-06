import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageCenter } from "./message-center";

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    supabase: null,
    user: null,
    householdId: null,
    status: "signed-out",
  }),
}));

vi.mock("@/lib/message-cloud", () => ({
  useCloudMessages: () => ({
    threads: [],
    people: [],
    teams: [],
    invitations: [],
    unreadCount: 0,
    loading: false,
    error: "",
    markRead: vi.fn(),
  }),
}));

describe("MessageCenter", () => {
  beforeEach(() => {
    localStorage.clear();
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  });

  afterEach(() => cleanup());

  it("creates a participant thread and sends a message", async () => {
    render(
      <MessageCenter
        open
        onClose={vi.fn()}
        ownerId="account-1"
        author="Faria"
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "New thread" })[0]!);
    fireEvent.change(screen.getByLabelText("Thread name"), {
      target: { value: "Weekend plans" },
    });

    const createThread = screen.getByRole("button", {
      name: "Create thread",
    });
    expect((createThread as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Add another person" }));
    fireEvent.change(screen.getByLabelText("Person’s name"), {
      target: { value: "Alex" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add and select" }));
    expect((createThread as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(createThread);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Weekend plans" }),
      ).toBeTruthy(),
    );

    fireEvent.change(screen.getByLabelText("Message Weekend plans"), {
      target: { value: "Dinner at six" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() =>
      expect(screen.getAllByText("Dinner at six").length).toBeGreaterThan(0),
    );
    expect(screen.getByText(/Faria/)).toBeTruthy();
  });

  it("requires at least one member before creating a team", () => {
    render(
      <MessageCenter
        open
        onClose={vi.fn()}
        ownerId="account-2"
        author="Faria"
      />,
    );

    // Teams are a professional group, so the workspace has to be there first.
    fireEvent.click(screen.getByRole("radio", { name: "Professional" }));
    fireEvent.click(screen.getByRole("button", { name: "Teams" }));
    fireEvent.click(screen.getAllByRole("button", { name: "New team" })[0]!);
    fireEvent.change(screen.getByLabelText("Team name"), {
      target: { value: "Parents" },
    });

    expect(
      (
        screen.getByRole("button", {
          name: "Create team",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByText("Choose at least one verified person."),
    ).toBeTruthy();
  });

  it("offers Family in Personal and Teams in Professional, never both", () => {
    render(
      <MessageCenter
        open
        onClose={vi.fn()}
        ownerId="account-3"
        author="Faria"
      />,
    );

    // Personal is the default, so the group tab is the household's.
    expect(screen.getByRole("button", { name: "Family" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Teams" })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Professional" }));
    expect(screen.getByRole("button", { name: "Teams" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Family" })).toBeNull();
  });

  it("moves you off a group tab the new workspace does not have", () => {
    render(
      <MessageCenter
        open
        onClose={vi.fn()}
        ownerId="account-4"
        author="Faria"
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Professional" }));
    fireEvent.click(screen.getByRole("button", { name: "Teams" }));
    expect(
      screen.getAllByRole("button", { name: "New team" }).length,
    ).toBeGreaterThan(0);

    // Back to Personal: the Teams panel must not survive the switch.
    fireEvent.click(screen.getByRole("radio", { name: "Personal" }));
    expect(screen.queryByRole("button", { name: "New team" })).toBeNull();
    expect(
      screen.getByText(/membership comes\s+from the household/i),
    ).toBeTruthy();
  });

  it("does not offer anything to create inside Family", () => {
    render(
      <MessageCenter
        open
        onClose={vi.fn()}
        ownerId="account-5"
        author="Faria"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Family" }));
    // Membership is inherited, so there is no composer here at all.
    expect(screen.queryByRole("button", { name: /New /i })).toBeNull();
    expect(
      screen.getByRole("link", { name: /Manage the household/i }),
    ).toBeTruthy();
  });
});
