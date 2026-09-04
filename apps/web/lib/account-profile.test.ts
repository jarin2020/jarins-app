import { describe, expect, it } from "vitest";
import { buildAccountProfile, getInitials } from "./account-profile";

describe("account profile", () => {
  it("prefers the account profile name over auth metadata", () => {
    const profile = buildAccountProfile(
      {
        email: "faria@example.com",
        user_metadata: { display_name: "Old name" },
      },
      {
        display_name: "Faria Jarin",
        timezone: "Europe/Berlin",
        locale: "de",
      },
    );

    expect(profile).toMatchObject({
      displayName: "Faria Jarin",
      email: "faria@example.com",
      initials: "FJ",
      timezone: "Europe/Berlin",
      locale: "de",
    });
  });

  it("falls back to a readable version of the account email", () => {
    expect(
      buildAccountProfile({
        email: "faria.jarin@example.com",
        user_metadata: {},
      }).displayName,
    ).toBe("faria jarin");
  });

  it("limits initials to two characters", () => {
    expect(getInitials("Faria Noor Jarin")).toBe("FN");
  });
});
