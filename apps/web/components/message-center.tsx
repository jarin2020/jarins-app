"use client";

import {
  ArrowUp,
  Baby,
  BriefcaseBusiness as Briefcase,
  Check,
  Copy,
  FileText,
  Mail,
  MessageCircle,
  MessagesSquare,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth-provider";
import { useCloudMessages } from "@/lib/message-cloud";
import {
  type MessagePerson,
  type MessageTeam,
  type MessageThread,
  useMessageThreads,
} from "@/lib/messages";
import { usePreferences } from "@/lib/preferences-store";

type MessageSection = "threads" | "people" | "teams" | "family";

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function MemberPicker({
  label,
  people,
  selected,
  onChange,
  emptyText = "Add people first, then assign them here.",
  disabled = false,
}: {
  label: string;
  people: MessagePerson[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyText?: string;
  disabled?: boolean;
}) {
  return (
    <fieldset className="member-picker">
      <legend>
        {label}
        {people.length > 1 && (
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() =>
              onChange(
                selected.length === people.length
                  ? []
                  : people.map((person) => person.id),
              )
            }
          >
            {selected.length === people.length ? "Clear" : "Select all"}
          </button>
        )}
      </legend>
      {people.length ? (
        <div>
          {people.map((person) => (
            <label key={person.id}>
              <input
                type="checkbox"
                checked={selected.includes(person.id)}
                onChange={() => onChange(toggleId(selected, person.id))}
                disabled={disabled}
              />
              <span>{person.name}</span>
              {selected.includes(person.id) && <Check size={13} />}
            </label>
          ))}
        </div>
      ) : (
        <small>{emptyText}</small>
      )}
    </fieldset>
  );
}

function TeamPicker({
  teams,
  selected,
  onChange,
  disabled = false,
}: {
  teams: MessageTeam[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="member-picker">
      <legend>Teams · {selected.length} selected</legend>
      {teams.length ? (
        <div>
          {teams.map((team) => (
            <label key={team.id}>
              <input
                type="checkbox"
                checked={selected.includes(team.id)}
                onChange={() => onChange(toggleId(selected, team.id))}
                disabled={disabled}
              />
              <span>{team.name}</span>
              <small>{team.memberIds.length}</small>
            </label>
          ))}
        </div>
      ) : (
        <small>Create a team to add everyone at once.</small>
      )}
    </fieldset>
  );
}

function PersonEditor({
  person,
  onSave,
  onRemove,
}: {
  person: MessagePerson;
  onSave: (changes: { name: string; detail: string }) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(person.name);
  const [detail, setDetail] = useState(person.detail);
  return (
    <form
      className="directory-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSave({ name, detail });
      }}
    >
      <span className="directory-editor-icon">
        <UserRound size={24} />
      </span>
      <div className="directory-editor-heading">
        <span className="kicker">Person profile</span>
        <h3>Edit person</h3>
        <p>Use a name and optional contact detail your household recognizes.</p>
      </div>
      <div className="directory-fields">
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            required
          />
        </label>
        <label>
          Email or note
          <input
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            maxLength={160}
            placeholder="alex@example.com or Family friend"
          />
        </label>
      </div>
      <div className="directory-actions">
        <button className="button primary small" type="submit">
          <Save size={15} /> Save person
        </button>
        <button
          className="button secondary small danger"
          type="button"
          onClick={() => {
            if (window.confirm(`Remove ${person.name} from Messages?`))
              onRemove();
          }}
        >
          <Trash2 size={15} /> Remove
        </button>
      </div>
    </form>
  );
}

function TeamEditor({
  team,
  people,
  busy,
  onSave,
  onRemove,
}: {
  team: MessageTeam;
  people: MessagePerson[];
  busy: boolean;
  onSave: (changes: { name: string; memberIds: string[] }) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [memberIds, setMemberIds] = useState(team.memberIds);
  return (
    <form
      className="directory-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSave({ name, memberIds });
      }}
    >
      <span className="directory-editor-icon team">
        <UsersRound size={24} />
      </span>
      <div className="directory-editor-heading">
        <span className="kicker">Team settings</span>
        <h3>Edit team</h3>
        <p>Rename this team or change who belongs to it.</p>
      </div>
      <div className="directory-fields">
        <label>
          Team name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            required
            disabled={busy}
          />
        </label>
        <MemberPicker
          label="People in this team"
          people={people}
          selected={memberIds}
          onChange={setMemberIds}
          disabled={busy}
        />
      </div>
      <div className="directory-actions">
        <button
          className="button primary small"
          type="submit"
          disabled={busy || memberIds.length === 0}
        >
          <Save size={15} /> Save team
        </button>
        <button
          className="button secondary small danger"
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Remove the ${team.name} team?`)) onRemove();
          }}
        >
          <Trash2 size={15} /> Remove
        </button>
      </div>
    </form>
  );
}

function ThreadEditor({
  thread,
  people,
  teams,
  busy,
  onSave,
  onRemove,
  onCancel,
}: {
  thread: MessageThread;
  people: MessagePerson[];
  teams: MessageTeam[];
  busy: boolean;
  onSave: (changes: {
    title: string;
    participantIds: string[];
    teamIds: string[];
  }) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(thread.title);
  const [participantIds, setParticipantIds] = useState(
    thread.participantIds ?? [],
  );
  const [teamIds, setTeamIds] = useState(thread.teamIds ?? []);
  return (
    <form
      className="thread-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        onSave({ title, participantIds, teamIds });
      }}
    >
      <div className="thread-editor-heading">
        <div>
          <span className="kicker">Thread settings</span>
          <h3>Edit conversation</h3>
        </div>
        <button
          className="text-button"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Done
        </button>
      </div>
      <label className="editor-field">
        Thread name
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={100}
          required
          disabled={busy}
        />
      </label>
      <div className="thread-member-grid">
        <MemberPicker
          label="Individual people"
          people={people}
          selected={participantIds}
          onChange={setParticipantIds}
          disabled={busy}
        />
        <TeamPicker
          teams={teams}
          selected={teamIds}
          onChange={setTeamIds}
          disabled={busy}
        />
      </div>
      <div className="directory-actions">
        <button
          className="button primary small"
          type="submit"
          disabled={
            busy || (participantIds.length === 0 && teamIds.length === 0)
          }
        >
          <Save size={15} /> Save thread
        </button>
        <button
          className="button secondary small danger"
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Remove the ${thread.title} thread?`))
              onRemove();
          }}
        >
          <Trash2 size={15} /> Remove thread
        </button>
      </div>
    </form>
  );
}

export function MessageCenter({
  open,
  onClose,
  ownerId,
  author,
  onUnreadCountChange,
}: {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  author: string;
  onUnreadCountChange?: (count: number) => void;
}) {
  const { supabase, user, householdId, status } = useAuth();
  const cloudEnabled = status === "signed-in" && Boolean(householdId);
  const dialog = useRef<HTMLDialogElement>(null);
  const messageInput = useRef<HTMLInputElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const { preferences, save: savePreferences } = usePreferences();
  // Resolved before the loaders run: it decides which conversations are
  // fetched at all, not merely which of them are shown.
  const workspace =
    preferences.workspace === "professional" ? "professional" : "personal";
  const local = useMessageThreads(ownerId);
  const cloud = useCloudMessages({
    supabase,
    userId: user?.id,
    householdId,
    workspace,
  });
  const threads = cloudEnabled ? cloud.threads : local.threads;
  const people = cloudEnabled ? cloud.people : local.people;
  const teams = cloudEnabled ? cloud.teams : local.teams;
  const readOnly = Boolean(
    cloudEnabled &&
    people.find((person) => person.id === user?.id)?.role === "viewer",
  );
  const [chosenSection, setSection] = useState<MessageSection>("threads");
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedPersonId, setSelectedPersonId] = useState<string>();
  const [selectedTeamId, setSelectedTeamId] = useState<string>();
  const [composing, setComposing] = useState(false);
  const [editingThread, setEditingThread] = useState(false);
  const [editingTeam, setEditingTeam] = useState(false);
  const [editingPerson, setEditingPerson] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [inviteRole, setInviteRole] = useState<"adult" | "viewer">("adult");
  const [showMemberInvite, setShowMemberInvite] = useState(false);
  const [memberInviteEmail, setMemberInviteEmail] = useState("");
  const [memberInviteNotice, setMemberInviteNotice] = useState("");
  const [invitationLink, setInvitationLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const showError = useCallback(
    (caught: unknown) => {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "That change could not be saved.",
      );
    },
    [setActionError],
  );

  useEffect(() => {
    onUnreadCountChange?.(cloudEnabled ? cloud.unreadCount : 0);
  }, [cloud.unreadCount, cloudEnabled, onUnreadCountChange]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);

  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const handleClose = () => close.current();
    element.addEventListener("close", handleClose);
    return () => element.removeEventListener("close", handleClose);
  }, []);

  // The group tab depends on the workspace: a household has a Family, an
  // employer has Teams, and neither belongs in the other's list. Derived rather
  // than corrected on change, so switching workspace moves you to the right tab
  // instead of leaving you on one that no longer exists.
  const groupSection: MessageSection =
    workspace === "professional" ? "teams" : "family";
  const section: MessageSection =
    chosenSection === "teams" || chosenSection === "family"
      ? groupSection
      : chosenSection;

  const activeTeamId =
    teams.find((team) => team.id === selectedTeamId)?.id ?? teams[0]?.id;

  /**
   * Which conversation the right-hand pane is showing.
   *
   * The tab decides, rather than there being three panes that each reinvent
   * one. Family and a team each have exactly one conversation of their own, so
   * choosing the group *is* choosing the thread — and Threads is left for the
   * groupings that answer to nothing else.
   */
  // Family and each team own a conversation apiece, and each has a tab of its
  // own to be reached through. Threads is what is left: the groupings that
  // answer to nothing else. Listing the others here as well would give the same
  // conversation two homes and no clear one.
  const ownThreads = threads.filter(
    (thread) => !thread.isFamily && !thread.teamId && !thread.directUserId,
  );
  // Yourself is in the household list but is not someone to write to, so the
  // People tab is everyone else. The pickers keep the full list, because
  // membership is a different question from who you can message.
  const others = people.filter((person) => person.id !== user?.id);
  const activePerson =
    others.find((person) => person.id === selectedPersonId) ?? others[0];
  const activeThread =
    section === "family"
      ? threads.find((thread) => thread.isFamily)
      : section === "teams"
        ? threads.find((thread) => thread.teamId === activeTeamId)
        : section === "people"
          ? threads.find((thread) => thread.directUserId === activePerson?.id)
          : (ownThreads.find((thread) => thread.id === selectedId) ??
            ownThreads[0]);
  const activeTeam =
    teams.find((team) => team.id === selectedTeamId) ?? teams[0];

  // A team's conversation is made when it is first opened rather than when the
  // team is created: a team that is never talked in should not leave an empty
  // thread behind, and this way the two can never be out of step.
  // The person's row in the list carries their conversation's news, the way a
  // thread's row carries its own.
  const directThreadFor = (personId: string) =>
    threads.find((thread) => thread.directUserId === personId);
  const directUnread = (personId: string) =>
    directThreadFor(personId)?.unreadCount ?? 0;
  const directLastLine = (personId: string) =>
    directThreadFor(personId)?.messages.at(-1)?.text;

  const activePersonId = activePerson?.id;
  useEffect(() => {
    if (section !== "people" || !activePersonId) return;
    if (threads.some((thread) => thread.directUserId === activePersonId))
      return;
    if (!cloudEnabled) {
      local.openDirectThread(activePersonId);
      return;
    }
    let active = true;
    void cloud.openDirectThread(activePersonId).catch((caught) => {
      if (active) showError(caught);
    });
    return () => {
      active = false;
    };
  }, [section, cloudEnabled, activePersonId, threads, cloud, local, showError]);

  useEffect(() => {
    if (section !== "teams" || !activeTeamId) return;
    if (threads.some((thread) => thread.teamId === activeTeamId)) return;
    if (!cloudEnabled) {
      local.openTeamThread(activeTeamId);
      return;
    }
    let active = true;
    void cloud.openTeamThread(activeTeamId).catch((caught) => {
      if (active) showError(caught);
    });
    return () => {
      active = false;
    };
  }, [section, cloudEnabled, activeTeamId, threads, cloud, local, showError]);

  const resetComposer = () => {
    setNewTitle("");
    setNewDetail("");
    setSelectedPeople([]);
    setSelectedTeams([]);
    setInvitationLink("");
    setShowMemberInvite(false);
    setMemberInviteEmail("");
    setMemberInviteNotice("");
    setComposing(false);
  };

  const addPersonFromComposer = async () => {
    if (!memberInviteEmail.trim()) return;
    setBusy(true);
    setActionError("");
    setMemberInviteNotice("");
    try {
      if (cloudEnabled) {
        const link = await cloud.invite(memberInviteEmail, inviteRole);
        setInvitationLink(link);
        setMemberInviteNotice(
          "Invitation created. They can be selected here after accepting it.",
        );
      } else {
        const person = local.createPerson({
          name: memberInviteEmail,
          detail: "",
        });
        setSelectedPeople((current) => [...current, person.id]);
        setMemberInviteNotice(`${person.name} was added and selected.`);
      }
      setMemberInviteEmail("");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const createItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTitle.trim()) return;
    if (
      (section === "threads" &&
        selectedPeople.length === 0 &&
        selectedTeams.length === 0) ||
      (section === "teams" && selectedPeople.length === 0)
    )
      return;
    setBusy(true);
    setActionError("");
    try {
      if (section === "threads") {
        const thread = await (cloudEnabled ? cloud.create : local.create)({
          title: newTitle,
          kind: selectedTeams.length ? "team" : "person",
          participantIds: selectedPeople,
          teamIds: selectedTeams,
        });
        setSelectedId(thread.id);
        queueMicrotask(() => messageInput.current?.focus());
      } else if (section === "people" && cloudEnabled) {
        const link = await cloud.invite(newTitle, inviteRole);
        setInvitationLink(link);
        setNewTitle("");
        setNewDetail("");
        setSelectedPeople([]);
        setSelectedTeams([]);
        setBusy(false);
        return;
      } else if (section === "people") {
        const person = local.createPerson({
          name: newTitle,
          detail: newDetail,
        });
        setSelectedPersonId(person.id);
      } else {
        const team = await (cloudEnabled ? cloud.createTeam : local.createTeam)(
          {
            name: newTitle,
            memberIds: selectedPeople,
          },
        );
        setSelectedTeamId(team.id);
      }
      resetComposer();
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeThread || (!text.trim() && !files.length)) return;
    setBusy(true);
    setActionError("");
    try {
      if (cloudEnabled)
        await cloud.send(activeThread.id, { text, author, files });
      else local.send(activeThread.id, { text, author });
      setText("");
      setFiles([]);
      if (attachmentInput.current) attachmentInput.current.value = "";
      messageInput.current?.focus();
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const switchSection = (next: MessageSection) => {
    resetComposer();
    setSection(next);
    setEditingThread(false);
    setEditingTeam(false);
    setEditingPerson(false);
    setActionError("");
  };

  const actionLabel =
    section === "threads"
      ? "New thread"
      : section === "people"
        ? cloudEnabled
          ? "Invite person"
          : "Add person"
        : section === "family"
          ? "Manage in Family"
          : "New team";
  const canCreateItem =
    Boolean(newTitle.trim()) &&
    (section === "people" ||
      (section === "threads"
        ? selectedPeople.length > 0 || selectedTeams.length > 0
        : selectedPeople.length > 0));

  const markCloudThreadRead = cloud.markRead;
  const latestActiveMessageId = activeThread?.messages.at(-1)?.id;

  useEffect(() => {
    if (!cloudEnabled || !open || !activeThread?.id) return;
    void markCloudThreadRead(activeThread.id).catch(showError);
  }, [
    activeThread?.id,
    latestActiveMessageId,
    markCloudThreadRead,
    cloudEnabled,
    open,
    showError,
  ]);

  const directPerson = activeThread?.directUserId
    ? people.find((person) => person.id === activeThread.directUserId)
    : undefined;
  // What to call the conversation on screen. Every kind but a pair one is
  // named by its title; a pair one is named by the person you are talking to.
  const conversationName = activeThread
    ? activeThread.directUserId
      ? (directPerson?.name ?? "Direct message")
      : activeThread.title
    : "";
  const threadParticipants = activeThread
    ? [
        ...(activeThread.participantIds ?? [])
          .map((id) => people.find((person) => person.id === id)?.name)
          .filter(Boolean),
        ...(activeThread.teamIds ?? [])
          .map((id) => teams.find((team) => team.id === id)?.name)
          .filter(Boolean),
      ]
    : [];

  return (
    <dialog
      ref={dialog}
      className="modal-dialog message-dialog"
      aria-labelledby="messages-title"
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="message-center">
        <header className="message-center-header">
          <h2 id="messages-title">Messages</h2>
          <div
            className="workspace-switch message-workspace-switch"
            role="radiogroup"
            aria-label="Workspace"
          >
            {(
              [
                { id: "personal", label: "Personal", Icon: Baby },
                {
                  id: "professional",
                  label: "Professional",
                  Icon: Briefcase,
                },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={workspace === id}
                className={workspace === id ? "active" : ""}
                onClick={() => {
                  if (workspace === id) return;
                  // The same preference the sidebar switch writes: one
                  // workspace, not a second one that only Messages knows about.
                  savePreferences({ ...preferences, workspace: id });
                  resetComposer();
                }}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close messages"
          >
            <X size={19} />
          </button>
        </header>

        <div className="message-center-body">
          <aside className="thread-sidebar">
            {readOnly && (
              <p className="composer-member-notice" role="note">
                Viewer access is read only. You can follow household threads,
                but only collaborators can send messages or change people and
                teams.
              </p>
            )}
            <div className="thread-filters" aria-label="Message sections">
              <button
                type="button"
                className={section === "threads" ? "active" : ""}
                onClick={() => switchSection("threads")}
              >
                <MessagesSquare size={15} /> Threads
              </button>
              <button
                type="button"
                className={section === "people" ? "active" : ""}
                onClick={() => switchSection("people")}
              >
                <UserRound size={15} /> People
              </button>
              <button
                type="button"
                className={section === groupSection ? "active" : ""}
                onClick={() => switchSection(groupSection)}
              >
                {groupSection === "teams" ? (
                  <>
                    <UsersRound size={15} /> Teams
                  </>
                ) : (
                  <>
                    <Baby size={15} /> Family
                  </>
                )}
              </button>
            </div>

            {section !== "family" && (
              <button
                type="button"
                className="new-thread-button"
                disabled={busy || readOnly}
                onClick={() => {
                  setActionError("");
                  setInvitationLink("");
                  setComposing((current) => !current);
                }}
                aria-expanded={composing}
              >
                <Plus size={15} /> {actionLabel}
              </button>
            )}

            {composing && (
              <form
                className="new-thread-form"
                onSubmit={(event) => void createItem(event)}
              >
                <label>
                  {section === "threads"
                    ? "Thread name"
                    : section === "people"
                      ? cloudEnabled
                        ? "Verified email"
                        : "Name"
                      : "Team name"}
                  <input
                    type={
                      section === "people" && cloudEnabled ? "email" : "text"
                    }
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                    placeholder={
                      section === "threads"
                        ? "Weekend plans"
                        : section === "people"
                          ? cloudEnabled
                            ? "person@example.com"
                            : "Person’s name"
                          : "Family team"
                    }
                    maxLength={100}
                    required
                    disabled={busy}
                  />
                </label>
                {section === "people" && cloudEnabled && (
                  <label>
                    Access
                    <select
                      value={inviteRole}
                      disabled={busy}
                      onChange={(event) =>
                        setInviteRole(event.target.value as "adult" | "viewer")
                      }
                    >
                      <option value="adult">Adult · can collaborate</option>
                      <option value="viewer">
                        Viewer · limited household access
                      </option>
                    </select>
                  </label>
                )}
                {section === "people" && !cloudEnabled && (
                  <label>
                    Email or note
                    <input
                      value={newDetail}
                      onChange={(event) => setNewDetail(event.target.value)}
                      placeholder="Optional"
                      maxLength={160}
                      disabled={busy}
                    />
                  </label>
                )}
                {(section === "threads" || section === "teams") && (
                  <>
                    <MemberPicker
                      label={`${section === "teams" ? "Team members" : "Individual people"} · ${selectedPeople.length} selected`}
                      people={people}
                      selected={selectedPeople}
                      onChange={setSelectedPeople}
                      disabled={busy}
                      emptyText={
                        cloudEnabled
                          ? "No verified family members are available yet. Invite someone below."
                          : "No people yet. Add someone below."
                      }
                    />
                    <section className="composer-member-invite">
                      <button
                        className="text-button"
                        type="button"
                        onClick={() =>
                          setShowMemberInvite((current) => !current)
                        }
                        aria-expanded={showMemberInvite}
                      >
                        <UserRound size={13} />
                        {cloudEnabled
                          ? "Invite another person"
                          : "Add another person"}
                      </button>
                      {showMemberInvite && (
                        <div>
                          <label>
                            {cloudEnabled ? "Email address" : "Person’s name"}
                            <input
                              type={cloudEnabled ? "email" : "text"}
                              value={memberInviteEmail}
                              disabled={busy}
                              onChange={(event) =>
                                setMemberInviteEmail(event.target.value)
                              }
                              placeholder={
                                cloudEnabled
                                  ? "person@example.com"
                                  : "Person’s name"
                              }
                              maxLength={cloudEnabled ? 320 : 100}
                            />
                          </label>
                          {cloudEnabled && (
                            <label>
                              Household access
                              <select
                                value={inviteRole}
                                disabled={busy}
                                onChange={(event) =>
                                  setInviteRole(
                                    event.target.value as "adult" | "viewer",
                                  )
                                }
                              >
                                <option value="adult">
                                  Adult · collaborate
                                </option>
                                <option value="viewer">Viewer · limited</option>
                              </select>
                            </label>
                          )}
                          <button
                            className="button secondary small"
                            type="button"
                            disabled={busy || !memberInviteEmail.trim()}
                            onClick={() => void addPersonFromComposer()}
                          >
                            <Plus size={13} />
                            {cloudEnabled ? "Create invite" : "Add and select"}
                          </button>
                        </div>
                      )}
                      {memberInviteNotice && (
                        <small className="composer-member-notice">
                          <Check size={12} /> {memberInviteNotice}
                        </small>
                      )}
                    </section>
                  </>
                )}
                {section === "threads" && (
                  <TeamPicker
                    teams={teams}
                    selected={selectedTeams}
                    onChange={setSelectedTeams}
                    disabled={busy}
                  />
                )}
                {(section === "threads" || section === "teams") &&
                  !canCreateItem && (
                    <small>
                      Choose at least one verified person
                      {section === "threads" ? " or team" : ""}.
                    </small>
                  )}
                <button
                  className="button primary small"
                  type="submit"
                  disabled={busy || !canCreateItem}
                >
                  {section === "people"
                    ? cloudEnabled
                      ? "Create invite link"
                      : "Add person"
                    : section === "teams"
                      ? "Create team"
                      : "Create thread"}
                </button>
                {invitationLink && (
                  <div className="invitation-link" role="status">
                    <small>
                      Share this one-time link with the invited person.
                    </small>
                    <div>
                      <input
                        readOnly
                        value={invitationLink}
                        aria-label="Invitation link"
                      />
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="Copy invitation link"
                        onClick={() =>
                          void navigator.clipboard.writeText(invitationLink)
                        }
                      >
                        <Copy size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </form>
            )}

            {(actionError || (cloudEnabled && cloud.error)) && (
              <p className="message-error" role="alert">
                {actionError || cloud.error}
              </p>
            )}

            <div className="thread-list">
              {cloudEnabled &&
                cloud.loading &&
                ((section === "threads" && ownThreads.length === 0) ||
                  (section === "people" && others.length === 0) ||
                  (section === "teams" && teams.length === 0)) && (
                  <p className="thread-list-status" role="status">
                    Loading messages…
                  </p>
                )}
              {section === "threads" &&
                ownThreads.map((thread) => {
                  const last = thread.messages.at(-1);
                  return (
                    <button
                      type="button"
                      key={thread.id}
                      className={activeThread?.id === thread.id ? "active" : ""}
                      onClick={() => {
                        setSelectedId(thread.id);
                        setEditingThread(false);
                      }}
                    >
                      <span>
                        <MessageCircle size={16} />
                      </span>
                      <div>
                        <strong>
                          {thread.title}
                          {(thread.unreadCount ?? 0) > 0 && (
                            <span className="thread-unread">
                              {thread.unreadCount}
                            </span>
                          )}
                        </strong>
                        <small>{last?.text ?? "New conversation"}</small>
                      </div>
                    </button>
                  );
                })}
              {section === "people" &&
                others.map((person) => (
                  <button
                    type="button"
                    key={person.id}
                    className={activePerson?.id === person.id ? "active" : ""}
                    onClick={() => setSelectedPersonId(person.id)}
                  >
                    <span>
                      <UserRound size={16} />
                    </span>
                    <div>
                      <strong>
                        {person.name}
                        {directUnread(person.id) > 0 && (
                          <span className="thread-unread">
                            {directUnread(person.id)}
                          </span>
                        )}
                      </strong>
                      <small>
                        {directLastLine(person.id) ??
                          (person.detail || "Person")}
                      </small>
                    </div>
                  </button>
                ))}
              {section === "people" &&
                cloudEnabled &&
                cloud.invitations.map((invitation) => (
                  <div className="pending-invitation" key={invitation.id}>
                    <span>
                      <Mail size={15} />
                    </span>
                    <div>
                      <strong>{invitation.email}</strong>
                      <small>
                        Pending {invitation.role} invite · expires{" "}
                        {new Intl.DateTimeFormat("en", {
                          dateStyle: "medium",
                        }).format(new Date(invitation.expiresAt))}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        setActionError("");
                        void cloud
                          .revokeInvitation(invitation.id)
                          .catch(showError)
                          .finally(() => setBusy(false));
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              {/* Not a button: the household has exactly one conversation and
                  it is already open, so there is nothing here to choose. */}
              {section === "family" && (
                <div className="thread-row">
                  <span>
                    <Baby size={16} />
                  </span>
                  <div>
                    <strong>Family</strong>
                    <small>
                      {people.length} member{people.length === 1 ? "" : "s"} ·
                      from your household
                    </small>
                  </div>
                </div>
              )}
              {section === "teams" &&
                teams.map((team) => (
                  <button
                    type="button"
                    key={team.id}
                    className={activeTeam?.id === team.id ? "active" : ""}
                    onClick={() => setSelectedTeamId(team.id)}
                  >
                    <span>
                      <UsersRound size={16} />
                    </span>
                    <div>
                      <strong>{team.name}</strong>
                      <small>
                        {team.memberIds.length} member
                        {team.memberIds.length === 1 ? "" : "s"}
                      </small>
                    </div>
                  </button>
                ))}
            </div>
          </aside>

          <section className="thread-view">
            {section === "threads" ||
            section === "family" ||
            section === "teams" ||
            section === "people" ? (
              editingPerson && activePerson && !cloudEnabled ? (
                <PersonEditor
                  key={activePerson.id}
                  person={activePerson}
                  onSave={(changes) => {
                    local.updatePerson(activePerson.id, changes);
                    setEditingPerson(false);
                  }}
                  onRemove={() => {
                    local.removePerson(activePerson.id);
                    setSelectedPersonId(undefined);
                    setEditingPerson(false);
                  }}
                />
              ) : editingTeam && activeTeam ? (
                <TeamEditor
                  key={activeTeam.id}
                  team={activeTeam}
                  people={people}
                  busy={busy}
                  onSave={(changes) => {
                    setBusy(true);
                    setActionError("");
                    const operation = cloudEnabled
                      ? cloud.updateTeam(activeTeam.id, changes)
                      : Promise.resolve(
                          local.updateTeam(activeTeam.id, changes),
                        );
                    void operation
                      .then(() => setEditingTeam(false))
                      .catch(showError)
                      .finally(() => setBusy(false));
                  }}
                  onRemove={() => {
                    setBusy(true);
                    setActionError("");
                    const operation = cloudEnabled
                      ? cloud.removeTeam(activeTeam.id)
                      : Promise.resolve(local.removeTeam(activeTeam.id));
                    void operation
                      .then(() => {
                        setSelectedTeamId(undefined);
                        setEditingTeam(false);
                      })
                      .catch(showError)
                      .finally(() => setBusy(false));
                  }}
                />
              ) : activeThread ? (
                editingThread ? (
                  <ThreadEditor
                    key={activeThread.id}
                    thread={activeThread}
                    people={people}
                    teams={teams}
                    busy={busy}
                    onSave={(changes) => {
                      setBusy(true);
                      setActionError("");
                      const operation = cloudEnabled
                        ? cloud.updateThread(activeThread.id, changes)
                        : Promise.resolve(
                            local.updateThread(activeThread.id, changes),
                          );
                      void operation
                        .then(() => setEditingThread(false))
                        .catch(showError)
                        .finally(() => setBusy(false));
                    }}
                    onRemove={() => {
                      setBusy(true);
                      setActionError("");
                      const operation = cloudEnabled
                        ? cloud.removeThread(activeThread.id)
                        : Promise.resolve(local.removeThread(activeThread.id));
                      void operation
                        .then(() => {
                          setSelectedId(undefined);
                          setEditingThread(false);
                        })
                        .catch(showError)
                        .finally(() => setBusy(false));
                    }}
                    onCancel={() => setEditingThread(false)}
                  />
                ) : (
                  <>
                    <header>
                      <div>
                        <span className="kicker">
                          {activeThread.isFamily
                            ? "Family thread"
                            : activeThread.teamId
                              ? "Team conversation"
                              : activeThread.directUserId
                                ? "Direct message"
                                : "Thread"}
                        </span>
                        {/* A pair conversation is stored under a key, not a
                            name, so it is titled by whoever you are talking
                            to — which is different for each of you. */}
                        <h3>{conversationName}</h3>
                        <small className="thread-participants">
                          {activeThread.isFamily
                            ? `${people.length} verified member${people.length === 1 ? "" : "s"} · membership updates automatically`
                            : activeThread.directUserId
                              ? `${directPerson?.detail ?? "In your household"}${directPerson?.verified ? " · Verified" : ""}`
                              : threadParticipants.length
                                ? threadParticipants.join(", ")
                                : "Only you so far"}
                        </small>
                      </div>
                      {activeThread.isFamily && cloudEnabled && (
                        <button
                          className="button secondary small"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            setActionError("");
                            void cloud
                              .syncFamily()
                              .catch(showError)
                              .finally(() => setBusy(false));
                          }}
                        >
                          <RefreshCw size={14} /> Sync members
                        </button>
                      )}
                      {/* A team's conversation is managed as a team, not as a
                          thread: its name and its people come from there. */}
                      {activeThread.teamId && (
                        <button
                          className="button secondary small"
                          type="button"
                          disabled={busy || readOnly}
                          onClick={() => setEditingTeam(true)}
                        >
                          <Pencil size={14} /> Team settings
                        </button>
                      )}
                      {activeThread.directUserId && !cloudEnabled && (
                        <button
                          className="button secondary small"
                          type="button"
                          disabled={busy}
                          onClick={() => setEditingPerson(true)}
                        >
                          <Pencil size={14} /> Edit person
                        </button>
                      )}
                      {!activeThread.isFamily &&
                        !activeThread.teamId &&
                        !activeThread.directUserId &&
                        (!cloudEnabled ||
                          activeThread.memberRole === "owner") && (
                          <button
                            className="button secondary small"
                            type="button"
                            disabled={busy || readOnly}
                            onClick={() => setEditingThread(true)}
                          >
                            <Pencil size={14} /> Manage
                          </button>
                        )}
                    </header>
                    <div className="thread-messages" aria-live="polite">
                      {activeThread.messages.length ? (
                        activeThread.messages.map((message) => (
                          <article
                            key={message.id}
                            className={
                              message.senderId && message.senderId !== user?.id
                                ? "message-received"
                                : "message-sent"
                            }
                          >
                            {message.text && <div>{message.text}</div>}
                            {(message.attachments ?? []).map((attachment) => (
                              <button
                                type="button"
                                className="message-attachment"
                                key={attachment.id}
                                onClick={() =>
                                  void cloud
                                    .openAttachment(attachment)
                                    .catch(showError)
                                }
                              >
                                <FileText size={15} />
                                <span>{attachment.fileName}</span>
                                <small>
                                  {Math.ceil(attachment.sizeBytes / 1024)} KB
                                </small>
                              </button>
                            ))}
                            <small>
                              {message.author} ·{" "}
                              {new Intl.DateTimeFormat("en", {
                                hour: "numeric",
                                minute: "2-digit",
                              }).format(new Date(message.createdAt))}
                              {message.senderId === user?.id &&
                                (message.readBy?.length ?? 0) > 0 &&
                                ` · Read by ${message.readBy!.join(", ")}`}
                            </small>
                          </article>
                        ))
                      ) : (
                        <div className="thread-empty">
                          <MessageCircle size={24} />
                          <strong>Start the conversation</strong>
                          <p>
                            {cloudEnabled
                              ? "Messages sync privately across participant devices."
                              : "Messages in this thread stay in this browser."}
                          </p>
                        </div>
                      )}
                    </div>
                    {files.length > 0 && (
                      <div className="message-file-queue">
                        {files.map((file, index) => (
                          <span key={`${file.name}-${file.size}-${index}`}>
                            <Paperclip size={13} /> {file.name}
                            <button
                              type="button"
                              aria-label={`Remove ${file.name}`}
                              onClick={() =>
                                setFiles((current) =>
                                  current.filter(
                                    (_, itemIndex) => itemIndex !== index,
                                  ),
                                )
                              }
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <form
                      className={`message-compose ${cloudEnabled ? "with-attachment" : ""}`}
                      onSubmit={(event) => void sendMessage(event)}
                    >
                      {cloudEnabled && (
                        <>
                          <input
                            ref={attachmentInput}
                            className="visually-hidden"
                            type="file"
                            disabled={readOnly}
                            multiple
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,.csv,.doc,.docx,.xls,.xlsx"
                            onChange={(event) =>
                              setFiles(Array.from(event.target.files ?? []))
                            }
                          />
                          <button
                            type="button"
                            className="icon-button attachment-button"
                            disabled={busy || readOnly}
                            onClick={() => attachmentInput.current?.click()}
                            aria-label="Attach files"
                          >
                            <Paperclip size={17} />
                          </button>
                        </>
                      )}
                      <input
                        ref={messageInput}
                        disabled={busy || readOnly}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder={`Message ${conversationName}`}
                        maxLength={4000}
                        aria-label={`Message ${conversationName}`}
                      />
                      <button
                        type="submit"
                        className="button primary"
                        disabled={
                          busy || readOnly || (!text.trim() && !files.length)
                        }
                        aria-label="Send message"
                      >
                        <ArrowUp size={17} />
                      </button>
                    </form>
                  </>
                )
              ) : section === "family" ? (
                <div className="message-empty">
                  <Baby size={28} />
                  <h3>No household yet</h3>
                  <p>
                    The Family conversation is the household&apos;s, and it
                    appears once there is one to belong to.
                  </p>
                </div>
              ) : section === "people" ? (
                <div className="message-empty">
                  <UserRound size={28} />
                  <h3>
                    {activePerson ? activePerson.name : "Nobody else yet"}
                  </h3>
                  <p>
                    {activePerson
                      ? "Opening your conversation\u2026"
                      : cloudEnabled
                        ? "Invite someone to the household, and you can write to them here."
                        : "Add someone, and you can write to them here."}
                  </p>
                  {!activePerson && (
                    <button
                      className="button primary small"
                      type="button"
                      onClick={() => setComposing(true)}
                    >
                      <Plus size={15} />{" "}
                      {cloudEnabled ? "Invite person" : "Add person"}
                    </button>
                  )}
                </div>
              ) : section === "teams" ? (
                <div className="message-empty">
                  <UsersRound size={28} />
                  <h3>{activeTeam ? activeTeam.name : "No teams yet"}</h3>
                  <p>
                    {activeTeam
                      ? "Opening this team\u2019s conversation\u2026"
                      : "Make a team, and its conversation opens here \u2014 named after it, with its people in it."}
                  </p>
                </div>
              ) : (
                <div className="message-empty">
                  <MessagesSquare size={28} />
                  <h3>No threads yet</h3>
                  <p>
                    Threads are for the groupings that are not a team or the
                    family — a one-off, a couple of people, a topic.
                  </p>
                  <button
                    className="button primary small"
                    type="button"
                    onClick={() => setComposing(true)}
                  >
                    <Plus size={15} /> New thread
                  </button>
                </div>
              )
            ) : activeTeam && (!cloudEnabled || activeTeam.canManage) ? (
              <TeamEditor
                key={activeTeam.id}
                team={activeTeam}
                people={people}
                busy={busy}
                onSave={(changes) => {
                  setBusy(true);
                  setActionError("");
                  const operation = cloudEnabled
                    ? cloud.updateTeam(activeTeam.id, changes)
                    : Promise.resolve(local.updateTeam(activeTeam.id, changes));
                  void operation.catch(showError).finally(() => setBusy(false));
                }}
                onRemove={() => {
                  setBusy(true);
                  setActionError("");
                  const operation = cloudEnabled
                    ? cloud.removeTeam(activeTeam.id)
                    : Promise.resolve(local.removeTeam(activeTeam.id));
                  void operation
                    .then(() => setSelectedTeamId(undefined))
                    .catch(showError)
                    .finally(() => setBusy(false));
                }}
              />
            ) : activeTeam ? (
              <div className="message-empty">
                <UsersRound size={28} />
                <h3>{activeTeam.name}</h3>
                <p>
                  You can use this team in threads. Its manager controls
                  membership.
                </p>
              </div>
            ) : (
              <div className="message-empty">
                <UsersRound size={28} />
                <h3>No teams yet</h3>
                <p>Create a named team and add people to it.</p>
                <button
                  className="button primary small"
                  type="button"
                  onClick={() => setComposing(true)}
                >
                  <Plus size={15} /> New team
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </dialog>
  );
}
