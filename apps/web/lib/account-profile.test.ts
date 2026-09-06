import { describe, expect, it } from "vitest";
import {
  buildAccountProfile,
  getInitials,
  toAccountProfileWrite,
  validateAccountProfileDraft,
  type AccountProfileDraft,
} from "./account-profile";

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

  it("reads the profile details back in the shape the form binds to", () => {
    const profile = buildAccountProfile(
      { email: "faria@example.com", user_metadata: {} },
      {
        display_name: "Faria Jarin",
        timezone: "Europe/Berlin",
        locale: "de",
        avatar_path: "11111111-1111-1111-1111-111111111111/photo.webp",
        pronouns: "she/her",
        headline: "German B2, then marketing",
        location: "Frankfurt",
        phone: "+49 151 0000000",
        birthday: "1992-04-17",
        accent_color: "terracotta",
        emergency_contact_name: "Zaman",
        emergency_contact_phone: "+49 151 1111111",
        emergency_contact_relation: "Partner",
        share_contact_with_household: false,
        links: [
          { platform: "linkedin", url: "https://www.linkedin.com/in/faria" },
        ],
      },
    );

    expect(profile).toMatchObject({
      avatarPath: "11111111-1111-1111-1111-111111111111/photo.webp",
      pronouns: "she/her",
      headline: "German B2, then marketing",
      location: "Frankfurt",
      phone: "+49 151 0000000",
      birthday: "1992-04-17",
      accent: "terracotta",
      emergencyContact: {
        name: "Zaman",
        phone: "+49 151 1111111",
        relation: "Partner",
      },
      shareContactWithHousehold: false,
      links: [
        { platform: "linkedin", url: "https://www.linkedin.com/in/faria" },
      ],
    });
  });

  it("gives every unset detail the empty value its input expects", () => {
    const profile = buildAccountProfile(
      { email: "faria@example.com", user_metadata: {} },
      { display_name: "Faria", timezone: null, locale: null },
    );

    expect(profile).toMatchObject({
      avatarPath: null,
      pronouns: "",
      headline: "",
      birthday: "",
      accent: "green",
      links: [],
      emergencyContact: { name: "", phone: "", relation: "" },
    });
  });

  it("treats a profile written before the sharing column as sharing", () => {
    // The column defaults to true, so a row that predates it is already
    // visible to the household. Defaulting the toggle to off would say
    // otherwise.
    expect(
      buildAccountProfile(
        { email: "faria@example.com", user_metadata: {} },
        { display_name: "Faria", timezone: null, locale: null },
      ).shareContactWithHousehold,
    ).toBe(true);
  });

  it("ignores an accent colour it cannot draw", () => {
    expect(
      buildAccountProfile(
        { email: "faria@example.com", user_metadata: {} },
        {
          display_name: "Faria",
          timezone: null,
          locale: null,
          accent_color: "hotpink",
        },
      ).accent,
    ).toBe("green");
  });

  it("writes an unset detail as null rather than an empty string", () => {
    const row = toAccountProfileWrite({
      ...draft,
      pronouns: "  ",
      headline: "",
      phone: " +49 151 0000000 ",
      birthday: "",
    });

    expect(row).toMatchObject({
      pronouns: null,
      headline: null,
      birthday: null,
      phone: "+49 151 0000000",
      emergency_contact_name: null,
      share_contact_with_household: true,
      links: [],
    });
  });

  it("trims a field to the length its column accepts", () => {
    expect(
      toAccountProfileWrite({ ...draft, headline: "x".repeat(200) })?.headline,
    ).toHaveLength(80);
    expect(
      toAccountProfileWrite({
        ...draft,
        links: Array.from({ length: 14 }, (_, index) => ({
          platform: "website" as const,
          url: `https://example.test/${index}`,
        })),
      }).links,
    ).toHaveLength(10);
  });

  it("falls back to the household timezone rather than writing an empty one", () => {
    expect(toAccountProfileWrite({ ...draft, timezone: " " }).timezone).toBe(
      "Europe/Berlin",
    );
  });

  it("rejects the two mistakes the column checks cannot catch", () => {
    const today = new Date("2026-09-06T00:00:00Z");
    expect(validateAccountProfileDraft(draft, today)).toBeNull();
    expect(
      validateAccountProfileDraft({ ...draft, displayName: "  " }, today),
    ).toBe("Add a display name.");
    expect(
      validateAccountProfileDraft({ ...draft, birthday: "2027-01-01" }, today),
    ).toBe("A birthday cannot be in the future.");
    expect(
      validateAccountProfileDraft({ ...draft, birthday: "1890-01-01" }, today),
    ).toBe("That birthday is too far back.");
    expect(
      validateAccountProfileDraft({ ...draft, birthday: "2026-09-06" }, today),
    ).toBeNull();
  });
});

const draft: AccountProfileDraft = {
  displayName: "Faria Jarin",
  timezone: "Europe/Berlin",
  locale: "de",
  accent: "green",
  pronouns: "",
  headline: "",
  location: "",
  bio: "",
  phone: "",
  birthday: "",
  emergencyContact: { name: "", phone: "", relation: "" },
  shareContactWithHousehold: true,
  links: [],
};
