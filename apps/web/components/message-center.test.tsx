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
    expect(screen.getByRole("button", { name: "Family" })).toBeTruthy();
  });

  it("opens a team's own conversation from the Teams tab", async () => {
    render(
      <MessageCenter
        open
        onClose={vi.fn()}
        ownerId="account-6"
        author="Faria"
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Professional" }));
    fireEvent.click(screen.getByRole("button", { name: "Teams" }));
    fireEvent.click(screen.getAllByRole("button", { name: "New team" })[0]!);
    fireEvent.change(screen.getByLabelText("Team name"), {
      target: { value: "Product" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add another person" }));
    fireEvent.change(screen.getByLabelText("Person’s name"), {
      target: { value: "Alex" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add and select" }));
    fireEvent.click(screen.getByRole("button", { name: "Create team" }));

    // The team is the conversation: choosing it in Teams is what opens it, and
    // you can talk there without going near the Threads tab.
    const composer = await screen.findByLabelText("Message Product");
    expect(screen.getByRole("heading", { name: "Product" })).toBeTruthy();
    expect(screen.getByText("Team conversation")).toBeTruthy();

    fireEvent.change(composer, { target: { value: "Standup at nine" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(screen.getAllByText("Standup at nine").length).toBeGreaterThan(0),
    );

    // And it stays the team's: Threads is for the groupings that answer to
    // nothing else, so the same conversation must not turn up twice.
    fireEvent.click(screen.getByRole("button", { name: "Threads" }));
    expect(screen.getByText("No threads yet")).toBeTruthy();
  });

  it("opens a conversation with one person from the People tab", async () => {
    render(
      <MessageCenter
        open
        onClose={vi.fn()}
        ownerId="account-7"
        author="Faria"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "People" }));
    const openComposer = screen.getAllByRole("button", { name: "Add person" });
    fireEvent.click(openComposer[0]!);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Alex" },
    });
    // The second one is the form's submit; the first opened the form.
    fireEvent.click(screen.getAllByRole("button", { name: "Add person" })[1]!);

    // Choosing the person is what opens the conversation — there is nothing to
    // name and nobody to pick out of a list.
    const composer = await screen.findByLabelText("Message Alex");
    expect(screen.getByText("Direct message")).toBeTruthy();

    fireEvent.change(composer, { target: { value: "Are you free at six?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(
        screen.getAllByText("Are you free at six?").length,
      ).toBeGreaterThan(0),
    );

    // And it belongs to the person, not to Threads.
    fireEvent.click(screen.getByRole("button", { name: "Threads" }));
    expect(screen.getByText("No threads yet")).toBeTruthy();
  });

  it("opens Family as a conversation, not a settings form", () => {
    render(
      <MessageCenter
        open
        onClose={vi.fn()}
        ownerId="account-5"
        author="Faria"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Family" }));
    // Membership is inherited, so the tab is for talking to the household
    // rather than configuring it — and with no household on this device, it
    // says that instead of offering to make a thread.
    expect(screen.queryByRole("button", { name: /New /i })).toBeNull();
    expect(screen.getByText(/No household yet/i)).toBeTruthy();
  });
});
