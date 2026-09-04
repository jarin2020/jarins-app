import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CALENDAR_ACCOUNTS_EVENT,
  calendarAccountsKey,
  readCalendarAccounts,
  writeCalendarAccounts,
  type CalendarAccount,
} from "./calendar-accounts";

const account: CalendarAccount = {
  id: "calendar-1",
  provider: "google",
  address: "faria@example.com",
  label: "Personal",
  syncMode: "two-way",
  included: true,
  createdAt: "2026-09-04T12:00:00.000Z",
};

describe("calendar account persistence", () => {
  beforeEach(() => localStorage.clear());

  it("keeps connected calendars scoped to the current account", () => {
    writeCalendarAccounts("user-a", [account]);

    expect(readCalendarAccounts("user-a")).toEqual([account]);
    expect(readCalendarAccounts("user-b")).toEqual([]);
    expect(calendarAccountsKey("user-a")).not.toBe(
      calendarAccountsKey("user-b"),
    );
  });

  it("rejects malformed saved connection data", () => {
    localStorage.setItem(calendarAccountsKey("user-a"), JSON.stringify([{}]));
    expect(readCalendarAccounts("user-a")).toEqual([]);
  });

  it("announces calendar connection changes", () => {
    const listener = vi.fn();
    window.addEventListener(CALENDAR_ACCOUNTS_EVENT, listener);
    writeCalendarAccounts("user-a", [account]);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(CALENDAR_ACCOUNTS_EVENT, listener);
  });
});
