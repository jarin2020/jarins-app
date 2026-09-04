import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeRecord } from "@/lib/jarins-store";
import { SelfDashboard } from "./self-dashboard";

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    supabase: {},
    user: { id: "owner-1" },
    status: "signed-in",
  }),
}));

vi.mock("@/lib/calendar-accounts", () => ({
  useCalendarEvents: () => ({
    events: [
      {
        id: "mine",
        ownerUserId: "owner-1",
        title: "Therapy appointment",
        startsAt: "2099-09-09T10:00:00.000Z",
        endsAt: "2099-09-09T11:00:00.000Z",
        sourceName: "Personal calendar",
      },
      {
        id: "family",
        ownerUserId: "adult-2",
        title: "Someone else’s appointment",
        startsAt: "2099-09-10T10:00:00.000Z",
        endsAt: "2099-09-10T11:00:00.000Z",
        sourceName: "Shared calendar",
      },
    ],
    error: "",
  }),
}));

const records: LifeRecord[] = [
  {
    id: "quiet-walk",
    module: "self",
    kind: "Protected time",
    title: "Quiet walk",
    detail: "Twenty minutes",
    date: "2099-09-08",
    status: "open",
    essential: true,
    createdAt: "2099-09-01T10:00:00.000Z",
    updatedAt: "2099-09-01T10:00:00.000Z",
  },
  {
    id: "routine",
    module: "self",
    kind: "Routine",
    title: "Morning stretch",
    detail: "Five minutes",
    status: "done",
    createdAt: "2099-09-01T10:00:00.000Z",
    updatedAt: "2099-09-01T10:00:00.000Z",
  },
  {
    id: "learning",
    module: "learning",
    kind: "Study session",
    title: "German speaking practice",
    detail: "One answer",
    status: "open",
    createdAt: "2099-09-01T10:00:00.000Z",
    updatedAt: "2099-09-01T10:00:00.000Z",
  },
];

describe("Self dashboard", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("shows personal actions, owned events, practices, and direction", () => {
    render(
      <SelfDashboard records={records} loading={false} update={vi.fn()} />,
    );

    expect(screen.getAllByText("Quiet walk")).toHaveLength(2);
    expect(screen.getByText("Therapy appointment")).toBeTruthy();
    expect(screen.queryByText("Someone else’s appointment")).toBeNull();
    expect(screen.getByText("Care, reflection, and consistency")).toBeTruthy();
    expect(screen.getByText("German speaking practice")).toBeTruthy();
  });

  it("saves energy and executes personal actions", () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const capture = vi.fn();
    window.addEventListener("jarins-open-capture", capture);
    render(<SelfDashboard records={records} loading={false} update={update} />);

    fireEvent.click(screen.getByRole("button", { name: /Full/i }));
    fireEvent.click(screen.getByRole("button", { name: /Capture something/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete Quiet walk" }),
    );

    expect(localStorage.getItem(localStorage.key(0)!)).toBe("5");
    expect(capture).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith("quiet-walk", {
      status: "done",
      progress: 100,
    });
    window.removeEventListener("jarins-open-capture", capture);
  });
});
