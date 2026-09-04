import type { User } from "@supabase/supabase-js";

export type StoredAccountProfile = {
  display_name: string | null;
  timezone: string | null;
  locale: string | null;
};

export type AccountProfile = {
  displayName: string;
  email: string;
  initials: string;
  timezone: string;
  locale: "en" | "de";
};

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
  };
}
