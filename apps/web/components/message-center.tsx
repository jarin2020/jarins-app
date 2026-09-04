"use client";

import {
  ArrowUp,
  Check,
  Copy,
  FileText,
  Mail,
  MessageCircle,
  MessagesSquare,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import { useCloudMessages } from "@/lib/message-cloud";
import {
  type MessagePerson,
  type MessageTeam,
  type MessageThread,
  useMessageThreads,
} from "@/lib/messages";

type MessageSection = "threads" | "people" | "teams";

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function MemberPicker({
  label,
  people,
  selected,
  onChange,
}: {
  label: string;
  people: MessagePerson[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="member-picker">
      <legend>{label}</legend>
      {people.length ? (
        <div>
          {people.map((person) => (
            <label key={person.id}>
              <input
                type="checkbox"
                checked={selected.includes(person.id)}
                onChange={() => onChange(toggleId(selected, person.id))}
              />
              <span>{person.name}</span>
              {selected.includes(person.id) && <Check size={13} />}
            </label>
          ))}
        </div>
      ) : (
        <small>Add people first, then assign them here.</small>
      )}
    </fieldset>
  );
}

function TeamPicker({
  teams,
  selected,
  onChange,
}: {
  teams: MessageTeam[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="member-picker">
      <legend>Teams</legend>
      {teams.length ? (
        <div>
          {teams.map((team) => (
            <label key={team.id}>
              <input
                type="checkbox"
                checked={selected.includes(team.id)}
                onChange={() => onChange(toggleId(selected, team.id))}
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
  onSave,
  onRemove,
}: {
  team: MessageTeam;
  people: MessagePerson[];
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
          />
        </label>
        <MemberPicker
          label="People in this team"
          people={people}
          selected={memberIds}
          onChange={setMemberIds}
        />
      </div>
      <div className="directory-actions">
        <button className="button primary small" type="submit">
          <Save size={15} /> Save team
        </button>
        <button
          className="button secondary small danger"
          type="button"
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
  onSave,
  onRemove,
  onCancel,
}: {
  thread: MessageThread;
  people: MessagePerson[];
  teams: MessageTeam[];
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
        <button className="text-button" type="button" onClick={onCancel}>
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
        />
      </label>
      <div className="thread-member-grid">
        <MemberPicker
          label="Individual people"
          people={people}
          selected={participantIds}
          onChange={setParticipantIds}
        />
        <TeamPicker teams={teams} selected={teamIds} onChange={setTeamIds} />
      </div>
      <div className="directory-actions">
        <button className="button primary small" type="submit">
          <Save size={15} /> Save thread
        </button>
        <button
          className="button secondary small danger"
          type="button"
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
  const local = useMessageThreads(ownerId);
  const cloud = useCloudMessages({
    supabase,
    userId: user?.id,
    householdId,
  });
  const threads = cloudEnabled ? cloud.threads : local.threads;
  const people = cloudEnabled ? cloud.people : local.people;
  const teams = cloudEnabled ? cloud.teams : local.teams;
  const [section, setSection] = useState<MessageSection>("threads");
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedPersonId, setSelectedPersonId] = useState<string>();
  const [selectedTeamId, setSelectedTeamId] = useState<string>();
  const [composing, setComposing] = useState(false);
  const [editingThread, setEditingThread] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [inviteRole, setInviteRole] = useState<"adult" | "viewer">("adult");
  const [invitationLink, setInvitationLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

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

  const activeThread =
    threads.find((thread) => thread.id === selectedId) ?? threads[0];
  const activePerson =
    people.find((person) => person.id === selectedPersonId) ?? people[0];
  const activeTeam =
    teams.find((team) => team.id === selectedTeamId) ?? teams[0];

  const resetComposer = () => {
    setNewTitle("");
    setNewDetail("");
    setSelectedPeople([]);
    setSelectedTeams([]);
    setInvitationLink("");
    setComposing(false);
  };

  const showError = (caught: unknown) => {
    setActionError(
      caught instanceof Error
        ? caught.message
        : "That change could not be saved.",
    );
  };

  const createItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTitle.trim()) return;
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
    setSection(next);
    setComposing(false);
    setEditingThread(false);
  };

  const actionLabel =
    section === "threads"
      ? "New thread"
      : section === "people"
        ? cloudEnabled
          ? "Invite person"
          : "Add person"
        : "New team";

  const markCloudThreadRead = cloud.markRead;
  const latestActiveMessageId = activeThread?.messages.at(-1)?.id;

  useEffect(() => {
    if (!cloudEnabled || !open || !activeThread?.id) return;
    void markCloudThreadRead(activeThread.id);
  }, [
    activeThread?.id,
    latestActiveMessageId,
    markCloudThreadRead,
    cloudEnabled,
    open,
  ]);

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
          <div>
            <span className="eyebrow">People, teams and threads</span>
            <h2 id="messages-title">Messages</h2>
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
                className={section === "teams" ? "active" : ""}
                onClick={() => switchSection("teams")}
              >
                <UsersRound size={15} /> Teams
              </button>
            </div>

            <button
              type="button"
              className="new-thread-button"
              onClick={() => setComposing((current) => !current)}
              aria-expanded={composing}
            >
              <Plus size={15} /> {actionLabel}
            </button>

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
                  />
                </label>
                {section === "people" && cloudEnabled && (
                  <label>
                    Access
                    <select
                      value={inviteRole}
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
                    />
                  </label>
                )}
                {(section === "threads" || section === "teams") && (
                  <MemberPicker
                    label={
                      section === "teams" ? "Team members" : "Individual people"
                    }
                    people={people}
                    selected={selectedPeople}
                    onChange={setSelectedPeople}
                  />
                )}
                {section === "threads" && (
                  <TeamPicker
                    teams={teams}
                    selected={selectedTeams}
                    onChange={setSelectedTeams}
                  />
                )}
                <button className="button primary small" type="submit">
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
              {section === "threads" &&
                threads.map((thread) => {
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
                people.map((person) => (
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
                      <strong>{person.name}</strong>
                      <small>
                        {person.detail || "Person"}
                        {person.verified ? " · Verified" : ""}
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
                      onClick={() => {
                        void cloud
                          .revokeInvitation(invitation.id)
                          .catch(showError);
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
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
            {section === "threads" ? (
              activeThread ? (
                editingThread ? (
                  <ThreadEditor
                    key={activeThread.id}
                    thread={activeThread}
                    people={people}
                    teams={teams}
                    onSave={(changes) => {
                      const operation = cloudEnabled
                        ? cloud.updateThread(activeThread.id, changes)
                        : Promise.resolve(
                            local.updateThread(activeThread.id, changes),
                          );
                      void operation
                        .then(() => setEditingThread(false))
                        .catch(showError);
                    }}
                    onRemove={() => {
                      const operation = cloudEnabled
                        ? cloud.removeThread(activeThread.id)
                        : Promise.resolve(local.removeThread(activeThread.id));
                      void operation
                        .then(() => {
                          setSelectedId(undefined);
                          setEditingThread(false);
                        })
                        .catch(showError);
                    }}
                    onCancel={() => setEditingThread(false)}
                  />
                ) : (
                  <>
                    <header>
                      <div>
                        <span className="kicker">Thread</span>
                        <h3>{activeThread.title}</h3>
                        <small className="thread-participants">
                          {threadParticipants.length
                            ? threadParticipants.join(", ")
                            : "Only you so far"}
                        </small>
                      </div>
                      {(!cloudEnabled ||
                        activeThread.memberRole === "owner") && (
                        <button
                          className="button secondary small"
                          type="button"
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
                            multiple
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,.csv,.doc,.docx,.xls,.xlsx"
                            onChange={(event) =>
                              setFiles(Array.from(event.target.files ?? []))
                            }
                          />
                          <button
                            type="button"
                            className="icon-button attachment-button"
                            onClick={() => attachmentInput.current?.click()}
                            aria-label="Attach files"
                          >
                            <Paperclip size={17} />
                          </button>
                        </>
                      )}
                      <input
                        ref={messageInput}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder={`Message ${activeThread.title}`}
                        maxLength={4000}
                        aria-label={`Message ${activeThread.title}`}
                      />
                      <button
                        type="submit"
                        className="button primary"
                        disabled={busy || (!text.trim() && !files.length)}
                        aria-label="Send message"
                      >
                        <ArrowUp size={17} />
                      </button>
                    </form>
                  </>
                )
              ) : (
                <div className="message-empty">
                  <MessagesSquare size={28} />
                  <h3>No threads yet</h3>
                  <p>Add people or teams, then begin a conversation.</p>
                  <button
                    className="button primary small"
                    type="button"
                    onClick={() => setComposing(true)}
                  >
                    <Plus size={15} /> New thread
                  </button>
                </div>
              )
            ) : section === "people" ? (
              activePerson ? (
                cloudEnabled ? (
                  <div className="directory-editor account-participant">
                    <span className="directory-editor-icon">
                      <UserRound size={24} />
                    </span>
                    <div className="directory-editor-heading">
                      <span className="kicker">Verified participant</span>
                      <h3>{activePerson.name}</h3>
                      <p>{activePerson.detail}</p>
                    </div>
                    <div className="participant-verification">
                      <Check size={17} />
                      <div>
                        <strong>Email verified</strong>
                        <small>
                          This account can receive messages on every signed-in
                          device.
                        </small>
                      </div>
                    </div>
                  </div>
                ) : (
                  <PersonEditor
                    key={activePerson.id}
                    person={activePerson}
                    onSave={(changes) =>
                      local.updatePerson(activePerson.id, changes)
                    }
                    onRemove={() => {
                      local.removePerson(activePerson.id);
                      setSelectedPersonId(undefined);
                    }}
                  />
                )
              ) : (
                <div className="message-empty">
                  <UserRound size={28} />
                  <h3>No people yet</h3>
                  <p>
                    {cloudEnabled
                      ? "Invite a verified account, then include it in teams and threads."
                      : "Add someone once, then include them in teams and threads."}
                  </p>
                  <button
                    className="button primary small"
                    type="button"
                    onClick={() => setComposing(true)}
                  >
                    <Plus size={15} />{" "}
                    {cloudEnabled ? "Invite person" : "Add person"}
                  </button>
                </div>
              )
            ) : activeTeam && (!cloudEnabled || activeTeam.canManage) ? (
              <TeamEditor
                key={activeTeam.id}
                team={activeTeam}
                people={people}
                onSave={(changes) => {
                  const operation = cloudEnabled
                    ? cloud.updateTeam(activeTeam.id, changes)
                    : Promise.resolve(local.updateTeam(activeTeam.id, changes));
                  void operation.catch(showError);
                }}
                onRemove={() => {
                  const operation = cloudEnabled
                    ? cloud.removeTeam(activeTeam.id)
                    : Promise.resolve(local.removeTeam(activeTeam.id));
                  void operation
                    .then(() => setSelectedTeamId(undefined))
                    .catch(showError);
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
