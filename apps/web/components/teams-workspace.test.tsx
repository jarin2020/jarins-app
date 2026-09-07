import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  createTeam: vi.fn(),
  inviteToTeam: vi.fn(),
  teams: true,
  householdOwner: true,
  bothKinds: false,
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
    teams: !mocks.teams
      ? []
      : mocks.bothKinds
        ? [
            {
              id: "team-1",
              name: "Growth pod",
              createdBy: "me",
              myRole: "owner",
              canManage: true,
              members: [
                {
                  userId: "me",
                  name: "Faria",
                  email: "f@example.test",
                  role: "owner",
                },
              ],
            },
            {
              id: "team-2",
              name: "Product",
              createdBy: "other",
              myRole: "member",
              canManage: false,
              members: [
                {
                  userId: "me",
                  name: "Faria",
                  email: "f@example.test",
                  role: "member",
                },
                {
                  userId: "other",
                  name: "Zaman",
                  email: "z@example.test",
                  role: "owner",
                },
              ],
            },
          ]
        : [
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
    isHouseholdOwner: mocks.householdOwner,
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
    createTeam: mocks.createTeam,
    inviteToTeam: mocks.inviteToTeam,
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
    mocks.teams = true;
    mocks.householdOwner = true;
    mocks.bothKinds = false;
    mocks.createTeam.mockResolvedValue("team-2");
    mocks.inviteToTeam.mockResolvedValue("t".repeat(64));
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

  it("creates a team here rather than sending you to Messages", async () => {
    mocks.teams = false;
    render(<TeamsWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /New team/ })).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole("button", { name: /New team/ }));
    fireEvent.change(screen.getByLabelText("Team name"), {
      target: { value: "Marketing and Sales" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mocks.createTeam).toHaveBeenCalledWith("Marketing and Sales"),
    );
  });

  it("does not tell you to go to Messages to make one", async () => {
    mocks.teams = false;
    render(<TeamsWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /New team/ })).toBeTruthy(),
    );
    expect(screen.queryByText(/from Messages/i)).toBeNull();
  });

  it("invites someone into the team with the access chosen", async () => {
    render(<TeamsWorkspace />);
    await waitFor(() =>
      expect(screen.getByLabelText("Email address")).toBeTruthy(),
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "colleague@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Access level"), {
      target: { value: "owner" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Invite/ }));

    await waitFor(() =>
      expect(mocks.inviteToTeam).toHaveBeenCalledWith(
        "team-1",
        "colleague@example.test",
        "owner",
      ),
    );
    // The link is shown so it can be sent by hand if the mail does not arrive.
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Invitation link") as HTMLInputElement).value,
      ).toContain("/auth/invite/"),
    );
  });

  it("keeps inviting to owners", async () => {
    mocks.canManage = false;
    mocks.myRole = "member";
    render(<TeamsWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Growth pod" })).toBeTruthy(),
    );
    expect(screen.queryByLabelText("Email address")).toBeNull();
  });

  it("leaves admitting a stranger to the household owner", async () => {
    // Owning a team is not the same as being able to let somebody into the
    // household around it, so the form is replaced by the reason.
    mocks.householdOwner = false;
    render(<TeamsWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Growth pod" })).toBeTruthy(),
    );

    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(screen.getByText(/household owner/i)).toBeTruthy();
  });

  it("offers no tabs when every team is the same kind", async () => {
    render(<TeamsWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Growth pod" })).toBeTruthy(),
    );
    // One kind of team is not a choice worth asking somebody to make.
    expect(screen.queryByRole("tab", { name: /You own/ })).toBeNull();
  });

  it("splits owned from joined only when both exist", async () => {
    mocks.bothKinds = true;
    render(<TeamsWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /You own 1/ })).toBeTruthy(),
    );
    expect(screen.getByRole("tab", { name: /You are in 1/ })).toBeTruthy();

    // The owned tab shows only the owned team.
    expect(screen.getByRole("heading", { name: "Growth pod" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /You are in 1/ }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Product" })).toBeTruthy(),
    );
  });

  it("says who you report to in a team you did not make", async () => {
    mocks.bothKinds = true;
    render(<TeamsWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /You are in 1/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("tab", { name: /You are in 1/ }));

    await waitFor(() => expect(screen.getByText(/You report to/)).toBeTruthy());
    // "Zaman" is in the member list too, so assert on the line itself.
    expect(document.querySelector(".teams-reports-to")?.textContent).toContain(
      "Zaman",
    );
  });

  it("tells a sole owner that the team answers to them", async () => {
    mocks.bothKinds = true;
    render(<TeamsWorkspace />);
    await waitFor(() => expect(screen.getByText(/only owner/i)).toBeTruthy());
  });
});
