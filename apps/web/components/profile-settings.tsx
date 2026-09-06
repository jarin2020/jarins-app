"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CakeSlice,
  Camera,
  Check,
  Eye,
  EyeOff,
  Globe,
  Languages,
  LogOut,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  X,
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
  profileLinkHandle,
  profileLinkLabel,
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

/**
 * The screen reads as a profile and edits one section at a time. Opening every
 * field at once was the previous behaviour and it made a settings page out of
 * something people mostly come to look at.
 */
type Section = "identity" | "contact" | "links" | "emergency" | "preferences";

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

const linkDraftsFrom = (links: AccountProfileDraft["links"]): LinkDraft[] =>
  links.map((link) => ({
    key: newKey(),
    platform: link.platform,
    url: link.url,
    label: link.label ?? "",
    pinned: true,
  }));

function birthdayLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** One read-only fact. Unset is stated rather than left blank, so the shape of
 *  the profile is the same whether or not it has been filled in. */
function Fact({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value?: string;
  icon?: typeof Phone;
}) {
  return (
    <div className="profile-fact">
      <dt>{label}</dt>
      <dd className={value ? "" : "is-unset"}>
        {Icon && value && <Icon size={13} aria-hidden="true" />}
        {value || "Not set"}
      </dd>
    </div>
  );
}

/**
 * Section chrome: a heading, who can see it, and the way into editing it.
 *
 * Module level on purpose. Declared inside ProfileSettings it would be a new
 * component type on every render, which remounts the subtree and drops focus
 * out of whichever field was being typed into.
 */
function SectionHeader({
  section,
  title,
  visibility,
  editing,
  shared,
  saving,
  onEdit,
  onCancel,
  onSave,
}: {
  section: Section;
  title: string;
  visibility?: "always" | "shared" | "private";
  editing: Section | null;
  shared: boolean;
  saving: boolean;
  onEdit: (section: Section) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const householdCanSee =
    visibility === "always" || (visibility === "shared" && shared);
  return (
    <div className="profile-section-header">
      <h3>{title}</h3>
      {visibility && (
        <span
          className={`profile-visibility is-${householdCanSee ? "always" : "private"}`}
        >
          {householdCanSee ? (
            <>
              <Eye size={12} /> Household
            </>
          ) : (
            <>
              <EyeOff size={12} /> Only you
            </>
          )}
        </span>
      )}
      {editing === section ? (
        <span className="profile-section-actions">
          <button
            type="button"
            className="button secondary small"
            onClick={onCancel}
          >
            <X size={14} /> Cancel
          </button>
          <button
            type="button"
            className="button primary small"
            disabled={saving}
            onClick={onSave}
          >
            <Check size={14} /> {saving ? "Saving…" : "Save"}
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="text-button profile-edit"
          aria-label={`Edit ${title.toLowerCase()}`}
          disabled={editing !== null}
          onClick={() => onEdit(section)}
        >
          <Pencil size={14} /> Edit
        </button>
      )}
    </div>
  );
}

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
  const [editing, setEditing] = useState<Section | null>(null);
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
      setLinks(linkDraftsFrom(next.links));
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

  const openSection = (section: Section) => {
    setError("");
    setMessage("");
    setEditing(section);
  };

  /** Abandons the edit by reloading the section from what is stored. */
  const cancel = () => {
    const stored = JSON.parse(loaded) as AccountProfileDraft;
    setDraft(stored);
    setLinks(linkDraftsFrom(stored.links));
    setError("");
    setEditing(null);
  };

  const persist = async (next: AccountProfileDraft) => {
    if (signedIn) await updateProfile(next);
    // Written locally either way: the shell, the message author name and every
    // date format read these three from preferences, including on a device
    // that is between sessions.
    savePreferences({
      ...preferences,
      name: next.displayName.trim(),
      timezone: toAccountProfileWrite(next).timezone,
      locale: next.locale,
    });
  };

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
      await persist(next);
      setEditing(null);
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

  /** A single switch reads better applied immediately than behind a Save. */
  const toggleSharing = async (share: boolean) => {
    const next = { ...draft, shareContactWithHousehold: share };
    setDraft(next);
    setError("");
    try {
      await persist(next);
      setMessage(share ? "Details shared" : "Details hidden");
      window.setTimeout(() => setMessage(""), 1800);
    } catch (toggleError) {
      setDraft(draft);
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "That setting could not be saved.",
      );
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

  const initials = getInitials(draft.displayName);
  const shared = draft.shareContactWithHousehold;

  const headerProps = {
    editing,
    shared,
    saving,
    onEdit: openSection,
    onCancel: cancel,
    onSave: () => void save(),
  };

  return (
    <div className="profile-screen">
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

      {/* ---- Identity ---- */}
      <section className="profile-card">
        <SectionHeader
          section="identity"
          title="Identity"
          visibility="always"
          {...headerProps}
        />

        {editing === "identity" ? (
          <>
            {signedIn && (
              <>
                <div className="profile-photo-row">
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
                      JPEG, PNG or WebP, up to 5 MB. Everyone in your household
                      can see it.
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
                        <Camera size={15} />{" "}
                        {avatarUrl ? "Replace" : "Upload photo"}
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
                </div>

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
                          onChange={() =>
                            patch("accent", accent.id as ProfileAccent)
                          }
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
                  Headline
                  <input
                    value={draft.headline}
                    maxLength={80}
                    placeholder="German B2, then back into marketing"
                    onChange={(event) => patch("headline", event.target.value)}
                  />
                </label>
                <label className="input-row">
                  About you
                  <textarea
                    value={draft.bio}
                    maxLength={280}
                    rows={3}
                    placeholder="A sentence your household would recognise you by."
                    onChange={(event) => patch("bio", event.target.value)}
                  />
                  <small className="input-counter">
                    {draft.bio.length}/280
                  </small>
                </label>
              </>
            )}
          </>
        ) : (
          <div className="profile-identity">
            <ProfileAvatar
              url={avatarUrl}
              initials={initials}
              accent={draft.accent}
              size="xl"
              alt={`Profile photo for ${draft.displayName || "your account"}`}
            />
            <div>
              <h2>
                {draft.displayName || "Unnamed"}
                {draft.pronouns && (
                  <em className="profile-pronouns">{draft.pronouns}</em>
                )}
              </h2>
              {draft.headline ? (
                <p className="profile-headline">{draft.headline}</p>
              ) : (
                <p className="profile-headline is-unset">No headline yet</p>
              )}
              {profile?.email && (
                <p className="profile-email">{profile.email}</p>
              )}
              {draft.bio && <p className="profile-bio">{draft.bio}</p>}
            </div>
          </div>
        )}
      </section>

      {signedIn && (
        <>
          {/* ---- Contact ---- */}
          <section className="profile-card">
            <SectionHeader
              section="contact"
              title="Contact"
              visibility="shared"
              {...headerProps}
            />
            {editing === "contact" ? (
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
            ) : (
              <dl className="profile-facts">
                <Fact label="Phone" value={draft.phone} icon={Phone} />
                <Fact
                  label="Where you are"
                  value={draft.location}
                  icon={MapPin}
                />
                <Fact
                  label="Birthday"
                  value={draft.birthday ? birthdayLabel(draft.birthday) : ""}
                  icon={CakeSlice}
                />
              </dl>
            )}
          </section>

          {/* ---- Links ---- */}
          <section className="profile-card">
            <SectionHeader
              section="links"
              title="Profiles and links"
              visibility="shared"
              {...headerProps}
            />
            {editing === "links" ? (
              <>
                <p className="muted">
                  LinkedIn, Xing, a portfolio — anything you would send someone.
                  The network is recognised from the address.
                </p>
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
              </>
            ) : draft.links.length ? (
              <div className="profile-link-chips">
                {draft.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    data-platform={link.platform}
                    title={profileLinkHandle(link)}
                  >
                    <BrandGlyph platform={link.platform} size={15} />
                    <span>{profileLinkLabel(link)}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="muted is-unset">
                <Globe size={13} /> No links yet.
              </p>
            )}
          </section>

          {/* ---- Emergency contact ---- */}
          <section className="profile-card">
            <SectionHeader
              section="emergency"
              title="Emergency contact"
              visibility="shared"
              {...headerProps}
            />
            {editing === "emergency" ? (
              <>
                <p className="muted">
                  Who your household should call about you, in the one place
                  they will think to look.
                </p>
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
              </>
            ) : (
              <dl className="profile-facts">
                <Fact label="Name" value={draft.emergencyContact.name} />
                <Fact
                  label="Phone"
                  value={draft.emergencyContact.phone}
                  icon={Phone}
                />
                <Fact
                  label="Relationship"
                  value={draft.emergencyContact.relation}
                />
              </dl>
            )}
          </section>

          {/* ---- Sharing ---- */}
          <section className="profile-card">
            <div className="profile-section-header">
              <h3>Sharing</h3>
            </div>
            <label className="toggle-row">
              <span>
                <strong>
                  {shared ? <Eye size={15} /> : <EyeOff size={15} />} Share
                  contact details with your household
                </strong>
                <small>
                  Covers your phone, birthday, location, links and emergency
                  contact. Your name, photo, pronouns and headline stay visible
                  either way — a family directory with an anonymous row in it is
                  not a directory.
                </small>
              </span>
              <input
                type="checkbox"
                checked={shared}
                onChange={(event) => void toggleSharing(event.target.checked)}
              />
            </label>
          </section>
        </>
      )}

      {/* ---- Preferences ---- */}
      <section className="profile-card">
        <SectionHeader
          section="preferences"
          title="Preferences"
          visibility="private"
          {...headerProps}
        />
        {editing === "preferences" ? (
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
        ) : (
          <dl className="profile-facts">
            <Fact label="Timezone" value={draft.timezone} icon={Globe} />
            <Fact
              label="Language"
              value={draft.locale === "de" ? "Deutsch" : "English"}
              icon={Languages}
            />
          </dl>
        )}
      </section>

      {/* ---- Account ---- */}
      {signedIn && (
        <section className="profile-card">
          <div className="profile-section-header">
            <h3>Account</h3>
            <span className="profile-visibility is-private">
              <EyeOff size={12} /> Only you
            </span>
          </div>
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
          <div className="profile-account-actions">
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
          </div>
        </section>
      )}

      <span
        className={`save-state ${error ? "is-error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {error || message}
      </span>
    </div>
  );
}
