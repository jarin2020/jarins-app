import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchOverlay } from "./search-overlay";

const supabase = vi.hoisted(() => {
  const filters: Record<string, string> = {};
  const builder = (table: string) => ({
    select: () => builder(table),
    eq: (column: string, value: string) => {
      filters[`${table}.${column}`] = value;
      return Promise.resolve({ data: [], error: null });
    },
  });
  return {
    filters,
    client: {
      rpc: () => Promise.resolve({ data: [], error: null }),
      from: (table: string) => builder(table),
    },
  };
});

vi.mock("./auth-provider", () => ({
  useAuth: () => ({
    supabase: supabase.client,
    user: { id: "me" },
    householdId: "household-1",
    status: "signed-in",
  }),
}));

vi.mock("@/lib/jarins-store", () => ({
  useLifeRecords: () => ({
    records: [
      {
        id: "1",
        module: "documents",
        kind: "Identity",
        title: "Passport renewal",
        detail: "",
        status: "open",
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "2",
        module: "family",
        kind: "Routine",
        title: "Kita bag",
        detail: "spare clothes",
        status: "open",
        createdAt: "",
        updatedAt: "",
      },
    ],
  }),
}));

describe("SearchOverlay", () => {
  beforeEach(() => {
    // jsdom ships <dialog> without its modal behaviour.
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  });
  afterEach(() => cleanup());

  const type = (value: string) =>
    fireEvent.change(screen.getByLabelText("Search jarins"), {
      target: { value },
    });

  it("invites a query rather than listing everything", () => {
    render(<SearchOverlay open onClose={vi.fn()} />);
    expect(screen.getByText(/Everything is searched at once/i)).toBeTruthy();
    expect(screen.queryByText("Kita bag")).toBeNull();
  });

  it("sorts a hit into the right category and says where it lives", async () => {
    render(<SearchOverlay open onClose={vi.fn()} />);
    type("passport");

    await waitFor(() =>
      expect(screen.getByText("Passport renewal")).toBeTruthy(),
    );
    expect(screen.getByText("Identity · Documents")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Documents 1$/ })).toBeTruthy();
    // A category with nothing in it cannot be selected.
    expect(
      screen
        .getByRole("button", { name: /^People 0$/ })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("filters to one category when its tab is chosen", async () => {
    render(<SearchOverlay open onClose={vi.fn()} />);
    type("a");
    await waitFor(() => expect(screen.getByText("Kita bag")).toBeTruthy());
    expect(screen.getByText("Passport renewal")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Tasks 1$/ }));
    expect(screen.getByText("Kita bag")).toBeTruthy();
    expect(screen.queryByText("Passport renewal")).toBeNull();
  });

  it("says so when nothing matches, quoting what was asked", async () => {
    render(<SearchOverlay open onClose={vi.fn()} />);
    type("xyzzy");
    await waitFor(() =>
      expect(screen.getByText(/Nothing matches/)).toBeTruthy(),
    );
  });

  it("closes when a result is opened", async () => {
    const onClose = vi.fn();
    render(<SearchOverlay open onClose={onClose} />);
    type("passport");
    await waitFor(() =>
      expect(screen.getByText("Passport renewal")).toBeTruthy(),
    );

    fireEvent.click(screen.getByText("Passport renewal"));
    expect(onClose).toHaveBeenCalled();
  });

  it("asks only for the household you are in", async () => {
    // Regression: the filters were written and then lost to a bad edit. Nothing
    // typechecked differently, so only an assertion on the query catches it —
    // without one, a person in two households sees two Family threads.
    render(<SearchOverlay open onClose={vi.fn()} />);

    await waitFor(() =>
      expect(supabase.filters["message_threads.household_id"]).toBe(
        "household-1",
      ),
    );
    expect(supabase.filters["message_teams.household_id"]).toBe("household-1");
  });
});
