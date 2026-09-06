import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamsWorkspace } from "./teams-workspace";

const mocks = vi.hoisted(() => ({
  canManage: true,
  myRole: "owner" as "owner" | "member",
  status: "signed-in" as "signed-in" | "signed-out",
  setRole: vi.fn(),
  setMembers: vi.fn(),
  addTask: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    supabase: {},
    user: { id: "me" },
    householdId: "household-1",
    status: mocks.status,
  }),
}));

vi.mock("@/lib/team-workspace", () => ({
  useTeamWorkspace: () => ({
    teams: [
      {
        id: "team-1",
        name: "Growth pod",
        createdBy: mocks.canManage ? "me" : "someone-else",
        myRole: mocks.myRole,
        canManage: mocks.canManage,
        members: [
          {
            userId: "me",
            name: "Faria",
            email: "f@example.test",
            role: mocks.myRole,
          },
          {
            userId: "other",
            name: "Zaman",
            email: "z@example.test",
            role: mocks.myRole === "owner" ? "member" : "owner",
          },
        ],
      },
    ],
    tasks: [
      {
        id: "task-1",
        teamId: "team-1",
        kind: "Deliverable",
        title: "Pricing page copy",
        detail: "",
        date: "",
        status: "open",
        assigneeUserId: "me",
      },
      {
        id: "task-2",
        teamId: "team-1",
        kind: "Deadline",
        title: "Someone else's job",
        detail: "",
        date: "",
        status: "open",
        assigneeUserId: "other",
      },
    ],
    directory: [
      { user_id: "me", display_name: "Faria", email: "f@example.test" },
      { user_id: "other", display_name: "Zaman", email: "z@example.test" },
      { user_id: "spare", display_name: "Nadia", email: "n@example.test" },
    ],
    loading: false,
    error: "",
    reload: vi.fn(),
    setMembers: mocks.setMembers,
    setRole: mocks.setRole,
    rename: vi.fn(),
    addTask: mocks.addTask,
    updateTask: mocks.updateTask,
  }),
}));

describe("TeamsWorkspace", () => {
  beforeEach(() => {
    mocks.canManage = true;
    mocks.myRole = "owner";
    mocks.status = "signed-in";
  });
  afterEach(() => cleanup());

  it("gives an owner the controls to run the team", async () => {
    render(<TeamsWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Growth pod" })).toBeTruthy(),
    );

    expect(screen.getByText("You own this team")).toBeTruthy();
    expect(screen.getByLabelText("Role for Zaman")).toBeTruthy();
    expect(screen.getByLabelText("Remove Zaman")).toBeTruthy();
    expect(screen.getByLabelText("Add a member")).toBeTruthy();
    expect(screen.getByLabelText("Assign to")).toBeTruthy();
  });

  it("offers only people who are not already in the team", async () => {
    render(<TeamsWorkspace />);
    await waitFor(() =>
      expect(screen.getByLabelText("Add a member")).toBeTruthy(),
    );

    const options = [
      ...screen.getByLabelText("Add a member").querySelectorAll("option"),
    ].map((option) => option.textContent);
    expect(options).toContain("Nadia");
    expect(options).not.toContain("Faria");
    expect(options).not.toContain("Zaman");
  });

  it("gives a member the team without the controls", async () => {
    mocks.canManage = false;
    mocks.myRole = "member";
    render(<TeamsWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Growth pod" })).toBeTruthy(),
    );

    expect(screen.getByText("You are a member")).toBeTruthy();
    expect(screen.queryByLabelText("Role for Zaman")).toBeNull();
    expect(screen.queryByLabelText("Remove Zaman")).toBeNull();
    expect(screen.queryByLabelText("Add a member")).toBeNull();
    expect(screen.queryByLabelText("Assign to")).toBeNull();
    // They still see the whole team's work, and are told what they may do.
    expect(screen.getByText("Someone else's job")).toBeTruthy();
    expect(screen.getByText(/finish what is assigned to you/i)).toBeTruthy();
  });

  it("lets a member finish their own task but not someone else's", async () => {
    mocks.canManage = false;
    mocks.myRole = "member";
    render(<TeamsWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Growth pod" })).toBeTruthy(),
    );

    expect(
      screen
        .getByLabelText("Complete Pricing page copy")
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen
        .getByLabelText("Complete Someone else's job")
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("says teams need an account when there is not one", async () => {
    mocks.status = "signed-out";
    render(<TeamsWorkspace />);
    expect(screen.getByText(/Teams need an account/i)).toBeTruthy();
  });
});
