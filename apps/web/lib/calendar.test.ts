import { describe, expect, it } from "vitest";
import { calendarProviderLabels, calendarProviders } from "./calendar";
import { calendarEventInputSchema } from "./calendar-validation";

describe("calendar integration", () => {
  it("supports the four provider families shown by the connection UI", () => {
    expect(calendarProviders).toEqual([
      "google",
      "microsoft",
      "apple",
      "caldav",
    ]);
    expect(calendarProviderLabels.microsoft).toMatch(/Microsoft/);
  });

  it("accepts a valid provider event", () => {
    expect(
      calendarEventInputSchema.safeParse({
        sourceId: "11111111-1111-4111-8111-111111111111",
        title: "School appointment",
        startsAt: "2026-09-05T08:00:00.000Z",
        endsAt: "2026-09-05T09:00:00.000Z",
        attendees: [{ address: "family@example.com" }],
      }).success,
    ).toBe(true);
  });

  it("rejects backwards dates and invalid attendees", () => {
    expect(
      calendarEventInputSchema.safeParse({
        sourceId: "11111111-1111-4111-8111-111111111111",
        title: "Broken event",
        startsAt: "2026-09-05T10:00:00.000Z",
        endsAt: "2026-09-05T09:00:00.000Z",
        attendees: [{ address: "not-an-email" }],
      }).success,
    ).toBe(false);
  });
});
