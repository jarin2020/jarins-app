import type { User } from "@supabase/supabase-js";
import {
  MAX_PROFILE_LINKS,
  parseProfileLinks,
  type ProfileLink,
} from "./profile-links";

/** The four accents the design system already draws, named for storage. */
export const profileAccents = [
  { id: "green", label: "Sage" },
  { id: "terracotta", label: "Terracotta" },
  { id: "amber", label: "Amber" },
  { id: "slate", label: "Slate" },
] as const;

export type ProfileAccent = (typeof profileAccents)[number]["id"];

export type StoredAccountProfile = {
  display_name: string | null;
  timezone: string | null;
  locale: string | null;
  avatar_path?: string | null;
  pronouns?: string | null;
  headline?: string | null;
  location?: string | null;
  bio?: string | null;
  phone?: string | null;
  birthday?: string | null;
  accent_color?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relation?: string | null;
  share_contact_with_household?: boolean | null;
  links?: unknown;
};

/**
 * The columns every profile read asks for. Kept in one place because the
 * account menu, the settings form and the account export all have to agree
 * with the migration, and a select list that drifts fails at runtime rather
 * than at build time.
 */
export const accountProfileColumns =
  "display_name, timezone, locale, avatar_path, pronouns, headline, location, bio, phone, birthday, accent_color, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, share_contact_with_household, links";

export type AccountProfile = {
  displayName: string;
  email: string;
  initials: string;
  timezone: string;
  locale: "en" | "de";
  /** Storage object inside the `avatars` bucket; the URL is signed on demand. */
  avatarPath: string | null;
  accent: ProfileAccent;
  pronouns: string;
  headline: string;
  location: string;
  bio: string;
  phone: string;
  /** ISO date, or "" — the shape an <input type="date"> wants either way. */
  birthday: string;
  emergencyContact: { name: string; phone: string; relation: string };
  shareContactWithHousehold: boolean;
  links: ProfileLink[];
};

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Text fields read back as "" rather than null, so they can bind to inputs. */
function text(value: unknown) {
  return nonEmptyString(value) ?? "";
}

export function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "J"
  );
}

export function isProfileAccent(value: unknown): value is ProfileAccent {
  return profileAccents.some((accent) => accent.id === value);
}

export function buildAccountProfile(
  user: Pick<User, "email" | "user_metadata">,
  stored?: StoredAccountProfile | null,
): AccountProfile {
  const metadata = user.user_metadata as Record<string, unknown>;
  const email = user.email ?? "";
  const emailName = email.split("@")[0]?.replace(/[._-]+/g, " ");
  const displayName =
    nonEmptyString(stored?.display_name) ??
    nonEmptyString(metadata.display_name) ??
    nonEmptyString(metadata.full_name) ??
    nonEmptyString(metadata.name) ??
    nonEmptyString(emailName) ??
    "Account";
  const locale = stored?.locale === "de" ? "de" : "en";

  return {
    displayName,
    email,
    initials: getInitials(displayName),
    timezone: nonEmptyString(stored?.timezone) ?? "Europe/Berlin",
    locale,
    avatarPath: nonEmptyString(stored?.avatar_path),
    accent: isProfileAccent(stored?.accent_color)
      ? stored.accent_color
      : "green",
    pronouns: text(stored?.pronouns),
    headline: text(stored?.headline),
    location: text(stored?.location),
    bio: text(stored?.bio),
    phone: text(stored?.phone),
    birthday: text(stored?.birthday).slice(0, 10),
    emergencyContact: {
      name: text(stored?.emergency_contact_name),
      phone: text(stored?.emergency_contact_phone),
      relation: text(stored?.emergency_contact_relation),
    },
    // Absent means a profile row that predates the column, and the column
    // defaults to sharing — so the two have to agree, or the settings toggle
    // would show "off" for a household that can already see the details.
    shareContactWithHousehold: stored?.share_contact_with_household !== false,
    links: parseProfileLinks(stored?.links),
  };
}

/** The editable half of a profile — everything the settings form owns. */
export type AccountProfileDraft = Pick<
  AccountProfile,
  | "displayName"
  | "timezone"
  | "locale"
  | "accent"
  | "pronouns"
  | "headline"
  | "location"
  | "bio"
  | "phone"
  | "birthday"
  | "emergencyContact"
  | "shareContactWithHousehold"
  | "links"
>;

/** The row shape a profile write sends. `avatar_path` is not here: a photo is
 *  saved when it uploads, not when the form is submitted. */
export type AccountProfileWrite = {
  display_name: string;
  timezone: string;
  locale: "en" | "de";
  accent_color: ProfileAccent;
  pronouns: string | null;
  headline: string | null;
  location: string | null;
  bio: string | null;
  phone: string | null;
  birthday: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  share_contact_with_household: boolean;
  links: ProfileLink[];
};

/** Empty is null in the column, not "": null is what "unset" means to SQL, and
 *  it is what the directory's `case when shared` arms already return. */
const orNull = (value: string, max: number) =>
  value.trim().slice(0, max) || null;

export function toAccountProfileWrite(
  draft: AccountProfileDraft,
): AccountProfileWrite {
  return {
    display_name: draft.displayName.trim().slice(0, 120),
    timezone: draft.timezone.trim() || "Europe/Berlin",
    locale: draft.locale,
    accent_color: draft.accent,
    pronouns: orNull(draft.pronouns, 32),
    headline: orNull(draft.headline, 80),
    location: orNull(draft.location, 80),
    bio: orNull(draft.bio, 280),
    phone: orNull(draft.phone, 32),
    birthday: orNull(draft.birthday, 10),
    emergency_contact_name: orNull(draft.emergencyContact.name, 80),
    emergency_contact_phone: orNull(draft.emergencyContact.phone, 32),
    emergency_contact_relation: orNull(draft.emergencyContact.relation, 40),
    share_contact_with_household: draft.shareContactWithHousehold,
    links: draft.links.slice(0, MAX_PROFILE_LINKS),
  };
}

/**
 * What the column checks cannot say. The bounds above are enforced in SQL and
 * silently trimmed here; these two would otherwise fail as a Postgres error in
 * front of somebody who only mistyped a year.
 */
export function validateAccountProfileDraft(
  draft: AccountProfileDraft,
  today = new Date(),
): string | null {
  if (!draft.displayName.trim()) return "Add a display name.";
  if (draft.birthday) {
    const birthday = new Date(`${draft.birthday}T00:00:00Z`);
    if (Number.isNaN(birthday.getTime())) return "That birthday is not a date.";
    if (draft.birthday > today.toISOString().slice(0, 10))
      return "A birthday cannot be in the future.";
    if (draft.birthday < "1900-01-01") return "That birthday is too far back.";
  }
  return null;
}
