"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Eye,
  EyeOff,
  LogOut,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  getInitials,
  profileAccents,
  toAccountProfileWrite,
  validateAccountProfileDraft,
  type AccountProfileDraft,
  type ProfileAccent,
} from "@/lib/account-profile";
import {
  MAX_PROFILE_LINKS,
  detectProfilePlatform,
  normalizeProfileUrl,
  profilePlatform,
  profilePlatforms,
  type ProfilePlatformId,
} from "@/lib/profile-links";
import { usePreferences } from "@/lib/preferences-store";
import { useAuth } from "./auth-provider";
import { BrandGlyph } from "./brand-glyph";
import { ProfileAvatar } from "./profile-avatar";

/**
 * A link while it is being edited, which is not the same thing as a stored one.
 * A half-typed URL has to survive a re-render, an empty row is a normal state
 * of a form and not of a profile, and `pinned` records that the person chose
 * the network themselves — after which guessing it from the host again would
 * undo their choice on the next keystroke.
 */
type LinkDraft = {
  key: string;
  platform: ProfilePlatformId;
  url: string;
  label: string;
  pinned: boolean;
};

const emptyDraft: AccountProfileDraft = {
  displayName: "",
  timezone: "Europe/Berlin",
  locale: "en",
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

const newKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Math.random());

export function ProfileSettings() {
  const { preferences, save: savePreferences } = usePreferences();
  const {
    profile,
    status,
    signOut,
    updateProfile,
    updatePassword,
    avatarUrl,
    uploadAvatar,
    removeAvatar,
  } = useAuth();
  const signedIn = status === "signed-in";

  const [draft, setDraft] = useState<AccountProfileDraft>(emptyDraft);
  const [links, setLinks] = useState<LinkDraft[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  // The account is the source of truth once there is one; without it the form
  // still edits the three preferences that work on one device.
  //
  // Serialised, and the effect keyed on the string rather than the object.
  // `profile` is rebuilt on every render of the auth provider, so an identity
  // dependency re-runs this whenever anything else in the provider changes —
  // an avatar URL arriving, a token refreshing — and each of those would wipe
  // out half-typed input. Content is what should reload the form; identity is
  // not the same thing.
  const loaded = JSON.stringify(
    signedIn && profile
      ? {
          displayName: profile.displayName,
          timezone: profile.timezone,
          locale: profile.locale,
          accent: profile.accent,
          pronouns: profile.pronouns,
          headline: profile.headline,
          location: profile.location,
          bio: profile.bio,
          phone: profile.phone,
          birthday: profile.birthday,
          emergencyContact: profile.emergencyContact,
          shareContactWithHousehold: profile.shareContactWithHousehold,
          links: profile.links,
        }
      : {
          ...emptyDraft,
          displayName: preferences.name,
          timezone: preferences.timezone,
          locale: preferences.locale,
        },
  );

  useEffect(() => {
    const next = JSON.parse(loaded) as AccountProfileDraft;
    queueMicrotask(() => {
      setDraft(next);
      setLinks(
        next.links.map((link) => ({
          key: newKey(),
          platform: link.platform,
          url: link.url,
          label: link.label ?? "",
          pinned: true,
        })),
      );
    });
  }, [loaded]);

  const patch = <K extends keyof AccountProfileDraft>(
    key: K,
    value: AccountProfileDraft[K],
  ) => setDraft((previous) => ({ ...previous, [key]: value }));

  const patchLink = (key: string, patchValue: Partial<LinkDraft>) =>
    setLinks((previous) =>
      previous.map((link) =>
        link.key === key ? { ...link, ...patchValue } : link,
      ),
    );

  const save = async () => {
    setError("");
    setMessage("");

    const collected: AccountProfileDraft["links"] = [];
    for (const [index, link] of links.entries()) {
      if (!link.url.trim()) continue; // an empty row is a row not filled in yet
      const url = normalizeProfileUrl(link.url);
      if (!url) {
        setError(`Link ${index + 1} is not a web address.`);
        return;
      }
      collected.push({
        platform: link.platform,
        url,
        ...(link.label.trim() ? { label: link.label.trim() } : {}),
      });
    }
    const next = { ...draft, links: collected };
    const invalid = validateAccountProfileDraft(next);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSaving(true);
    try {
      if (signedIn) await updateProfile(next);
      // Written locally either way: the shell, the message author name and
      // every date format read these three from preferences, including on a
      // device that is between sessions.
      savePreferences({
        ...preferences,
        name: next.displayName.trim(),
        timezone: toAccountProfileWrite(next).timezone,
        locale: next.locale,
      });
      setMessage("Saved");
      window.setTimeout(() => setMessage(""), 1800);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Profile could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const choosePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // so re-picking the same file fires change again
    if (!file) return;
    setError("");
    setAvatarBusy(true);
    try {
      await uploadAvatar(file);
      setMessage("Photo updated");
      window.setTimeout(() => setMessage(""), 1800);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "That photo could not be uploaded.",
      );
    } finally {
      setAvatarBusy(false);
    }
  };

  const dropPhoto = async () => {
    setError("");
    setAvatarBusy(true);
    try {
      await removeAvatar();
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "That photo could not be removed.",
      );
    } finally {
      setAvatarBusy(false);
    }
  };

  const changePassword = async () => {
    setError("");
    try {
      await updatePassword(newPassword);
      setNewPassword("");
      setMessage("Password changed");
      window.setTimeout(() => setMessage(""), 1800);
    } catch (passwordError) {
      setError(
        passwordError instanceof Error
          ? passwordError.message
          : "Password could not be changed.",
      );
    }
  };

  // From the draft, not the saved profile: the tile is a preview of the change
  // being made, and initials that only catch up after Save read as a bug.
  const initials = getInitials(draft.displayName);

  return (
    <>
      {!signedIn && (
        <div className="data-warning" role="note">
          <strong>A photo and contact details need an account.</strong>
          <p>
            Without one there is no household to show them to and no server to
            keep them on. The name, timezone and language below are saved on
            this device.{" "}
            {status === "signed-out" && (
              <Link href="/auth/signup">Create an account</Link>
            )}
          </p>
        </div>
      )}

      {signedIn && (
        <>
          <section className="profile-photo-row">
            <ProfileAvatar
              url={avatarUrl}
              initials={initials}
              accent={draft.accent}
              size="xl"
              alt={`Profile photo for ${draft.displayName || "your account"}`}
            />
            <div>
              <strong>Profile photo</strong>
              <small>
                JPEG, PNG or WebP, up to 5 MB. Everyone in your household can
                see it.
              </small>
              <div className="profile-photo-actions">
                <input
                  ref={photoInput}
                  className="visually-hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void choosePhoto(event)}
                />
                <button
                  type="button"
                  className="button secondary small"
                  disabled={avatarBusy}
                  onClick={() => photoInput.current?.click()}
                >
                  <Camera size={15} /> {avatarUrl ? "Replace" : "Upload photo"}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={avatarBusy}
                    onClick={() => void dropPhoto()}
                  >
                    <Trash2 size={15} /> Remove
                  </button>
                )}
              </div>
            </div>
          </section>

          <fieldset className="profile-accent">
            <legend>Accent</legend>
            <small>
              Colours your initials and your card in the family directory.
            </small>
            <div>
              {profileAccents.map((accent) => (
                <label key={accent.id} className={`accent-${accent.id}`}>
                  <input
                    type="radio"
                    name="profile-accent"
                    value={accent.id}
                    checked={draft.accent === accent.id}
                    onChange={() => patch("accent", accent.id as ProfileAccent)}
                  />
                  <span aria-hidden="true" />
                  {accent.label}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <label className="input-row">
        Display name
        <input
          value={draft.displayName}
          maxLength={120}
          autoComplete="name"
          onChange={(event) => patch("displayName", event.target.value)}
        />
      </label>

      {signedIn && (
        <>
          <div className="input-grid">
            <label className="input-row">
              Pronouns
              <input
                value={draft.pronouns}
                maxLength={32}
                placeholder="she/her"
                onChange={(event) => patch("pronouns", event.target.value)}
              />
            </label>
            <label className="input-row">
              Birthday
              <input
                type="date"
                value={draft.birthday}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => patch("birthday", event.target.value)}
              />
            </label>
          </div>
          <label className="input-row">
            Headline
            <input
              value={draft.headline}
              maxLength={80}
              placeholder="German B2, then back into marketing"
              onChange={(event) => patch("headline", event.target.value)}
            />
          </label>
          <div className="input-grid">
            <label className="input-row">
              Phone
              <input
                type="tel"
                value={draft.phone}
                maxLength={32}
                autoComplete="tel"
                placeholder="+49 151 0000000"
                onChange={(event) => patch("phone", event.target.value)}
              />
            </label>
            <label className="input-row">
              Where you are
              <input
                value={draft.location}
                maxLength={80}
                placeholder="Frankfurt am Main"
                onChange={(event) => patch("location", event.target.value)}
              />
            </label>
          </div>
          <label className="input-row">
            About you
            <textarea
              value={draft.bio}
              maxLength={280}
              rows={3}
              placeholder="A sentence your household would recognise you by."
              onChange={(event) => patch("bio", event.target.value)}
            />
            <small className="input-counter">{draft.bio.length}/280</small>
          </label>

          <section className="profile-links">
            <div className="profile-links-heading">
              <div>
                <strong>Profiles and links</strong>
                <small>
                  LinkedIn, Xing, a portfolio — anything you would send someone.
                  The network is recognised from the address.
                </small>
              </div>
              <button
                type="button"
                className="button secondary small"
                disabled={links.length >= MAX_PROFILE_LINKS}
                onClick={() =>
                  setLinks((previous) => [
                    ...previous,
                    {
                      key: newKey(),
                      platform: "website",
                      url: "",
                      label: "",
                      pinned: false,
                    },
                  ])
                }
              >
                <Plus size={15} /> Add link
              </button>
            </div>

            {links.length === 0 && <p className="muted">No links yet.</p>}

            {links.map((link, index) => (
              <div className="profile-link-row" key={link.key}>
                <span
                  className="profile-link-glyph"
                  data-platform={link.platform}
                >
                  <BrandGlyph platform={link.platform} size={16} />
                </span>
                <select
                  aria-label={`Network for link ${index + 1}`}
                  value={link.platform}
                  onChange={(event) =>
                    patchLink(link.key, {
                      platform: event.target.value as ProfilePlatformId,
                      pinned: true,
                    })
                  }
                >
                  {profilePlatforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Address for link ${index + 1}`}
                  value={link.url}
                  maxLength={300}
                  inputMode="url"
                  placeholder={profilePlatform(link.platform).example}
                  onChange={(event) => {
                    const url = event.target.value;
                    const normalized = normalizeProfileUrl(url);
                    patchLink(link.key, {
                      url,
                      // Only until the person picks a network themselves.
                      ...(link.pinned || !normalized
                        ? {}
                        : { platform: detectProfilePlatform(normalized) }),
                    });
                  }}
                />
                <input
                  aria-label={`Label for link ${index + 1}`}
                  value={link.label}
                  maxLength={40}
                  placeholder="Label (optional)"
                  onChange={(event) =>
                    patchLink(link.key, { label: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={`Remove link ${index + 1}`}
                  onClick={() =>
                    setLinks((previous) =>
                      previous.filter((row) => row.key !== link.key),
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </section>

          {/* A fieldset rather than a section: "Phone" appears twice on this
              form, and only a legend tells a screen reader which one is which. */}
          <fieldset className="profile-emergency">
            <legend>
              <TriangleAlert size={15} /> Emergency contact
            </legend>
            <small>
              Who your household should call about you, in the one place they
              will think to look.
            </small>
            <div className="input-grid">
              <label className="input-row">
                Name
                <input
                  value={draft.emergencyContact.name}
                  maxLength={80}
                  onChange={(event) =>
                    patch("emergencyContact", {
                      ...draft.emergencyContact,
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label className="input-row">
                Phone
                <input
                  type="tel"
                  value={draft.emergencyContact.phone}
                  maxLength={32}
                  onChange={(event) =>
                    patch("emergencyContact", {
                      ...draft.emergencyContact,
                      phone: event.target.value,
                    })
                  }
                />
              </label>
              <label className="input-row">
                Relationship
                <input
                  value={draft.emergencyContact.relation}
                  maxLength={40}
                  placeholder="Partner"
                  onChange={(event) =>
                    patch("emergencyContact", {
                      ...draft.emergencyContact,
                      relation: event.target.value,
                    })
                  }
                />
              </label>
            </div>
          </fieldset>

          <label className="toggle-row">
            <span>
              <strong>
                {draft.shareContactWithHousehold ? (
                  <Eye size={15} />
                ) : (
                  <EyeOff size={15} />
                )}{" "}
                Share contact details with your household
              </strong>
              <small>
                Covers your phone, birthday, location, about, links and
                emergency contact. Your name, photo, pronouns and headline stay
                visible either way — a family directory with an anonymous row in
                it is not a directory.
              </small>
            </span>
            <input
              type="checkbox"
              checked={draft.shareContactWithHousehold}
              onChange={(event) =>
                patch("shareContactWithHousehold", event.target.checked)
              }
            />
          </label>
        </>
      )}

      <div className="input-grid">
        <label className="input-row">
          Timezone
          <input
            value={draft.timezone}
            onChange={(event) => patch("timezone", event.target.value)}
          />
        </label>
        <label className="input-row">
          Locale
          <select
            value={draft.locale}
            onChange={(event) =>
              patch("locale", event.target.value as "en" | "de")
            }
          >
            <option value="en">English</option>
            <option value="de">Deutsch</option>
          </select>
        </label>
      </div>

      <button
        className="button primary"
        disabled={saving || !draft.displayName.trim()}
        onClick={() => void save()}
      >
        {saving ? "Saving…" : "Save profile"}
      </button>

      {signedIn && (
        <>
          <label className="input-row">
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <button
            className="button secondary"
            disabled={newPassword.length < 10}
            onClick={() => void changePassword()}
          >
            Change password
          </button>
          <button className="button secondary" onClick={() => void signOut()}>
            <LogOut size={16} /> Sign out
          </button>
        </>
      )}

      <span
        className={`save-state ${error ? "is-error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {error || message}
      </span>
    </>
  );
}
