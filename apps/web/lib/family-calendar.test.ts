import { beforeEach, describe, expect, it } from "vitest";
import {
  ensureOwnerMember,
  familyCalendarKey,
  readFamilyCalendar,
  writeFamilyCalendar,
} from "./family-calendar";

describe("family calendar persistence", () => {
  beforeEach(() => localStorage.clear());

  it("creates one owner member and stays account scoped", () => {
    const first = ensureOwnerMember("user-a", "Faria");
    const second = ensureOwnerMember("user-a", "Faria");

    expect(first.id).toBe(second.id);
    expect(readFamilyCalendar("user-a").members).toHaveLength(1);
    expect(readFamilyCalendar("user-b")).toEqual({ members: [], events: [] });
    expect(familyCalendarKey("user-a")).not.toBe(familyCalendarKey("user-b"));
  });

  it("rejects malformed saved family calendar data", () => {
    localStorage.setItem(familyCalendarKey("user-a"), JSON.stringify({}));
    expect(readFamilyCalendar("user-a")).toEqual({ members: [], events: [] });
  });

  it("stores members and shared events together", () => {
    const owner = ensureOwnerMember("user-a", "Faria");
    const value = readFamilyCalendar("user-a");
    const now = "2026-09-04T12:00:00.000Z";
    writeFamilyCalendar("user-a", {
      members: value.members,
      events: [
        {
          id: "event-1",
          title: "Family dinner",
          date: "2026-09-05",
          startTime: "18:00",
          endTime: "19:00",
          memberIds: [owner.id],
          location: "Home",
          notes: "",
          sharedWithEveryone: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    expect(readFamilyCalendar("user-a").events[0]).toMatchObject({
      title: "Family dinner",
      sharedWithEveryone: true,
    });
  });
});
