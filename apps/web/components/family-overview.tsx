"use client";

import Link from "next/link";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  File,
  Folder,
  FolderKey,
  Mail,
  MessageCircle,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { FamilyCalendar } from "@/components/family-calendar";
import { useCalendarEvents } from "@/lib/calendar-accounts";
import { useEmailAccounts } from "@/lib/email-accounts";
import { useHouseholdMembers } from "@/lib/household-members";
import type { LifeRecord } from "@/lib/jarins-store";
import { usePreferences } from "@/lib/preferences-store";
import {
  storageProviderLabels,
  useStorageAccounts,
  useStorageItems,
} from "@/lib/storage-accounts";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "J"
  );
}

function roleLabel(role: string) {
  if (role === "owner") return "Household owner";
  if (role === "adult") return "Adult";
  if (role === "viewer") return "Viewer";
  return "Child";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

async function sendInvitationEmail(
  accountId: string,
  email: string,
  householdName: string,
  invitationLink: string,
) {
  const response = await fetch(`/api/email/accounts/${accountId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: [email],
      subject: `Join ${householdName} on Jarins`,
      text: [
        `You have been invited to join ${householdName} on Jarins.`,
        "",
        "Open this private, one-time invitation link:",
        invitationLink,
        "",
        "The invitation expires in seven days and must be accepted using this email address.",
      ].join("\n"),
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok)
    throw new Error(payload.error || "The invitation email could not be sent.");
}

export function FamilyOverview({ records }: { records: LifeRecord[] }) {
  const { supabase, user, householdId, status } = useAuth();
  const { preferences } = usePreferences();
  const ownerId = user?.id ?? "local";
  const directory = useHouseholdMembers({
    supabase,
    userId: user?.id,
    householdId,
  });
  const calendar = useCalendarEvents(ownerId, supabase);
  const storage = useStorageAccounts(ownerId, supabase);
  const vaultItems = useStorageItems(ownerId, supabase, {
    kind: "all",
    enabled: storage.accounts.some((account) => account.status === "active"),
  });
  const emailAccounts = useEmailAccounts(ownerId, supabase);
  const senders = emailAccounts.accounts.filter(
    (account) => account.status === "active",
  );
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"adult" | "viewer">("adult");
  const [senderId, setSenderId] = useState("");
  const [invitationLink, setInvitationLink] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");

  const householdName = preferences.household || "Your family";
  const upcoming = useMemo(() => {
    const now = new Date().toISOString();
    const providerEvents = calendar.events
      .filter(
        (event) =>
          event.endsAt >= now &&
          (event.ownerUserId === user?.id || event.sharedWithHousehold),
      )
      .map((event) => ({
        id: `calendar:${event.id}`,
        title: event.title,
        startsAt: event.startsAt,
        detail: `${event.ownerName} · ${event.sourceName}`,
        href: "/family/calendar",
      }));
    const systemEvents = records
      .filter(
        (record) => Boolean(record.date) && record.date! >= now.slice(0, 10),
      )
      .map((record) => ({
        id: `record:${record.id}`,
        title: record.title,
        startsAt: `${record.date}T12:00:00`,
        detail: record.kind,
        href: "/family/calendar",
      }));
    return [...providerEvents, ...systemEvents]
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 5);
  }, [calendar.events, records, user?.id]);

  const submitInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("invite");
    setActionError("");
    setNotice("");
    setInvitationLink("");
    try {
      const link = await directory.invite(inviteEmail, inviteRole);
      setInvitationLink(link);
      if (senderId) {
        try {
          await sendInvitationEmail(senderId, inviteEmail, householdName, link);
          setNotice(`Invitation emailed to ${inviteEmail}.`);
          setInviteEmail("");
        } catch (emailError) {
          setActionError(
            `${emailError instanceof Error ? emailError.message : "Email delivery failed."} The invitation was created; copy its link below.`,
          );
        }
      } else {
        setNotice(
          "Invitation created. Copy the link or open it in your email app.",
        );
      }
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Invitation could not be created.",
      );
    } finally {
      setBusy("");
    }
  };

  const updateRole = async (memberId: string, role: "adult" | "viewer") => {
    setBusy(memberId);
    setActionError("");
    try {
      await directory.updateRole(memberId, role);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Member access could not change.",
      );
    } finally {
      setBusy("");
    }
  };

  const removeMember = async (memberId: string, name: string) => {
    if (!window.confirm(`Remove ${name} from this household?`)) return;
    setBusy(memberId);
    setActionError("");
    try {
      await directory.remove(memberId);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Member could not be removed.",
      );
    } finally {
      setBusy("");
    }
  };

  if (status === "demo") {
    return (
      <section className="family-directory-empty">
        <UsersRound size={24} />
        <div>
          <h2>Sign in to build your family space</h2>
          <p>
            Verified members, invitations, shared calendars, and connected
            storage follow the household account across devices.
          </p>
        </div>
        <Link href="/login" className="button primary small">
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <div className="family-overview">
      <section
        className="family-directory"
        aria-labelledby="family-people-title"
      >
        <header className="family-section-header">
          <div>
            <span className="eyebrow">Your household</span>
            <h2 id="family-people-title">Family members</h2>
            <p>
              Verified accounts can share plans, files, teams, and
              conversations.
            </p>
          </div>
          <div className="family-section-actions">
            <button
              className="button secondary small"
              type="button"
              onClick={() =>
                window.dispatchEvent(new Event("jarins-open-messages"))
              }
            >
              <MessageCircle size={15} /> Message family
            </button>
            {directory.canManage && (
              <button
                className="button primary small"
                type="button"
                onClick={() => setShowInvite((shown) => !shown)}
                aria-expanded={showInvite}
              >
                <UserPlus size={15} /> Add family member
              </button>
            )}
          </div>
        </header>

        {(actionError || directory.error) && (
          <p className="family-action-error" role="alert">
            {actionError || directory.error}
          </p>
        )}
        {notice && (
          <p className="family-action-notice" role="status">
            <Check size={14} /> {notice}
          </p>
        )}

        {showInvite && directory.canManage && (
          <form className="family-invite-form" onSubmit={submitInvitation}>
            <div>
              <Mail size={19} />
              <div>
                <strong>Invite by email</strong>
                <small>
                  The verified address receives access only after accepting.
                </small>
              </div>
            </div>
            <label>
              Email address
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="family@example.com"
                maxLength={320}
                required
              />
            </label>
            <label>
              Access
              <select
                value={inviteRole}
                onChange={(event) =>
                  setInviteRole(event.target.value as "adult" | "viewer")
                }
              >
                <option value="adult">Adult · collaborate</option>
                <option value="viewer">Viewer · read only</option>
              </select>
            </label>
            <label>
              Send from
              <select
                value={senderId}
                onChange={(event) => setSenderId(event.target.value)}
              >
                <option value="">Create link only</option>
                {senders.map((account) => (
                  <option value={account.id} key={account.id}>
                    {account.label} · {account.address}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button primary small"
              type="submit"
              disabled={busy === "invite"}
            >
              <Send size={14} />
              {senderId ? "Send invitation" : "Create invitation"}
            </button>
            {!senders.length && (
              <Link href="/inbox" className="text-button family-connect-mail">
                Connect an email account to send directly
                <ChevronRight size={14} />
              </Link>
            )}
          </form>
        )}

        {invitationLink && (
          <div className="family-invitation-link">
            <input
              readOnly
              aria-label="Family invitation link"
              value={invitationLink}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Copy family invitation link"
              onClick={() => void navigator.clipboard.writeText(invitationLink)}
            >
              <Copy size={15} />
            </button>
            {inviteEmail && (
              <a
                className="button secondary small"
                href={`mailto:${encodeURIComponent(inviteEmail)}?subject=${encodeURIComponent(`Join ${householdName} on Jarins`)}&body=${encodeURIComponent(`Open your private Jarins invitation: ${invitationLink}`)}`}
              >
                <Mail size={14} /> Email it
              </a>
            )}
          </div>
        )}

        <div className="family-member-grid">
          {directory.loading && !directory.members.length ? (
            <p className="muted">Loading family members…</p>
          ) : (
            directory.members.map((member, index) => {
              const isOwner = member.role === "owner";
              const isCurrent = member.userId === user?.id;
              return (
                <article className="family-account-card" key={member.userId}>
                  <span className={`family-account-avatar tone-${index % 5}`}>
                    {initials(member.displayName)}
                  </span>
                  <div>
                    <strong>
                      {member.displayName}
                      {isCurrent && <small>You</small>}
                    </strong>
                    <p>{member.email}</p>
                    <span>
                      <UserCheck size={12} /> {roleLabel(member.role)} ·
                      Verified
                    </span>
                  </div>
                  {directory.canManage && !isOwner && !isCurrent && (
                    <div className="family-member-controls">
                      <select
                        aria-label={`Access for ${member.displayName}`}
                        value={member.role === "viewer" ? "viewer" : "adult"}
                        disabled={busy === member.userId}
                        onChange={(event) =>
                          void updateRole(
                            member.userId,
                            event.target.value as "adult" | "viewer",
                          )
                        }
                      >
                        <option value="adult">Adult</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        type="button"
                        className="icon-button danger"
                        disabled={busy === member.userId}
                        onClick={() =>
                          void removeMember(member.userId, member.displayName)
                        }
                        aria-label={`Remove ${member.displayName}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>

        {directory.canManage && directory.invitations.length > 0 && (
          <div className="family-pending-invitations">
            <span className="kicker">Pending invitations</span>
            {directory.invitations.map((invitation) => (
              <div key={invitation.id}>
                <Mail size={15} />
                <span>
                  <strong>{invitation.email}</strong>
                  <small>
                    {roleLabel(invitation.role)} · expires{" "}
                    {dateLabel(invitation.expiresAt)}
                  </small>
                </span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    void directory
                      .revokeInvitation(invitation.id)
                      .catch((error) =>
                        setActionError(
                          error instanceof Error
                            ? error.message
                            : "Invitation could not be revoked.",
                        ),
                      )
                  }
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="family-overview-panels">
        <section className="family-overview-panel family-calendar-preview">
          <header>
            <span className="family-panel-icon calendar">
              <CalendarDays size={19} />
            </span>
            <div>
              <span className="eyebrow">Everyone’s schedule</span>
              <h2>Family calendar</h2>
            </div>
            <Link href="/family/calendar" className="text-button">
              Full calendar <ChevronRight size={14} />
            </Link>
          </header>
          {calendar.error ? (
            <p className="family-panel-error">{calendar.error}</p>
          ) : upcoming.length ? (
            <div className="family-agenda-list">
              {upcoming.map((event) => (
                <Link href={event.href} key={event.id}>
                  <time>{dateLabel(event.startsAt)}</time>
                  <span>
                    <strong>{event.title}</strong>
                    <small>{event.detail}</small>
                  </span>
                  <ChevronRight size={14} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="family-panel-empty">
              <Clock3 size={21} />
              <strong>No upcoming family events</strong>
              <p>Shared calendars and dated family items will appear here.</p>
            </div>
          )}
          <Link href="/calendar" className="family-panel-footer">
            Connect or manage external calendars <ChevronRight size={14} />
          </Link>
        </section>

        <section className="family-overview-panel family-vault-preview">
          <header>
            <span className="family-panel-icon vault">
              <FolderKey size={19} />
            </span>
            <div>
              <span className="eyebrow">Household files</span>
              <h2>Family VAULT</h2>
            </div>
            <Link href="/family/vault" className="text-button">
              Open VAULT <ChevronRight size={14} />
            </Link>
          </header>
          <div className="family-vault-stats">
            <span>
              <strong>{storage.accounts.length}</strong>
              connected drives
            </span>
            <span>
              <strong>
                {storage.accounts
                  .reduce((total, account) => total + account.itemCount, 0)
                  .toLocaleString()}
              </strong>
              indexed items
            </span>
          </div>
          {storage.error || vaultItems.error ? (
            <p className="family-panel-error">
              {storage.error || vaultItems.error}
            </p>
          ) : vaultItems.items.length ? (
            <div className="family-vault-list">
              {vaultItems.items.slice(0, 5).map((item) => (
                <Link href="/family/vault" key={item.id}>
                  {item.kind === "folder" ? (
                    <Folder size={16} />
                  ) : (
                    <File size={16} />
                  )}
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {
                        storageProviderLabels[
                          storage.accounts.find(
                            (account) => account.id === item.accountId,
                          )?.provider ?? "webdav"
                        ]
                      }
                    </small>
                  </span>
                  <ChevronRight size={14} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="family-panel-empty">
              <FolderKey size={21} />
              <strong>Connect the family’s storage</strong>
              <p>
                Provider permissions still decide who can open each shared file.
              </p>
            </div>
          )}
          <Link href="/vault" className="family-panel-footer">
            <ShieldCheck size={13} /> Manage storage connections
            <ChevronRight size={14} />
          </Link>
        </section>
      </div>
    </div>
  );
}

export function FamilyCalendarRoute({ records }: { records: LifeRecord[] }) {
  const { supabase, user, profile, householdId } = useAuth();
  const { preferences } = usePreferences();
  const calendar = useCalendarEvents(user?.id ?? "local", supabase);
  const directory = useHouseholdMembers({
    supabase,
    userId: user?.id,
    householdId,
  });
  return (
    <FamilyCalendar
      ownerId={householdId ?? user?.id ?? "local"}
      currentUserId={user?.id ?? "local"}
      ownerName={profile?.displayName ?? preferences.name}
      externalEvents={calendar.events}
      householdMembers={directory.members.map((member) => ({
        id: member.userId,
        name: member.displayName,
      }))}
      systemEvents={records
        .filter((record) => Boolean(record.date))
        .map((record) => ({
          id: record.id,
          title: record.title,
          date: record.date!,
          kind: record.kind,
          href: "/family",
        }))}
    />
  );
}
