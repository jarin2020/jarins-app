"use client";

import {
  ArrowUp,
  Check,
  MessageCircle,
  MessagesSquare,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
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
}: {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  author: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const messageInput = useRef<HTMLInputElement>(null);
  const {
    threads,
    people,
    teams,
    create,
    send,
    updateThread,
    removeThread,
    createPerson,
    updatePerson,
    removePerson,
    createTeam,
    updateTeam,
    removeTeam,
  } = useMessageThreads(ownerId);
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
    setComposing(false);
  };

  const createItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTitle.trim()) return;
    if (section === "threads") {
      const thread = create({
        title: newTitle,
        kind: selectedTeams.length ? "team" : "person",
        participantIds: selectedPeople,
        teamIds: selectedTeams,
      });
      setSelectedId(thread.id);
      queueMicrotask(() => messageInput.current?.focus());
    } else if (section === "people") {
      const person = createPerson({ name: newTitle, detail: newDetail });
      setSelectedPersonId(person.id);
    } else {
      const team = createTeam({ name: newTitle, memberIds: selectedPeople });
      setSelectedTeamId(team.id);
    }
    resetComposer();
  };

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeThread || !text.trim()) return;
    send(activeThread.id, { text, author });
    setText("");
    messageInput.current?.focus();
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
        ? "Add person"
        : "New team";

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
              <form className="new-thread-form" onSubmit={createItem}>
                <label>
                  {section === "threads"
                    ? "Thread name"
                    : section === "people"
                      ? "Name"
                      : "Team name"}
                  <input
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                    placeholder={
                      section === "threads"
                        ? "Weekend plans"
                        : section === "people"
                          ? "Person’s name"
                          : "Family team"
                    }
                    maxLength={100}
                    required
                  />
                </label>
                {section === "people" && (
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
                    ? "Add person"
                    : section === "teams"
                      ? "Create team"
                      : "Create thread"}
                </button>
              </form>
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
                        <strong>{thread.title}</strong>
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
                      <small>{person.detail || "Person"}</small>
                    </div>
                  </button>
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
                      updateThread(activeThread.id, changes);
                      setEditingThread(false);
                    }}
                    onRemove={() => {
                      removeThread(activeThread.id);
                      setSelectedId(undefined);
                      setEditingThread(false);
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
                      <button
                        className="button secondary small"
                        type="button"
                        onClick={() => setEditingThread(true)}
                      >
                        <Pencil size={14} /> Manage
                      </button>
                    </header>
                    <div className="thread-messages" aria-live="polite">
                      {activeThread.messages.length ? (
                        activeThread.messages.map((message) => (
                          <article key={message.id}>
                            <div>{message.text}</div>
                            <small>
                              {message.author} ·{" "}
                              {new Intl.DateTimeFormat("en", {
                                hour: "numeric",
                                minute: "2-digit",
                              }).format(new Date(message.createdAt))}
                            </small>
                          </article>
                        ))
                      ) : (
                        <div className="thread-empty">
                          <MessageCircle size={24} />
                          <strong>Start the conversation</strong>
                          <p>Messages in this thread stay in this browser.</p>
                        </div>
                      )}
                    </div>
                    <form className="message-compose" onSubmit={sendMessage}>
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
                        disabled={!text.trim()}
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
                <PersonEditor
                  key={activePerson.id}
                  person={activePerson}
                  onSave={(changes) => updatePerson(activePerson.id, changes)}
                  onRemove={() => {
                    removePerson(activePerson.id);
                    setSelectedPersonId(undefined);
                  }}
                />
              ) : (
                <div className="message-empty">
                  <UserRound size={28} />
                  <h3>No people yet</h3>
                  <p>
                    Add someone once, then include them in teams and threads.
                  </p>
                  <button
                    className="button primary small"
                    type="button"
                    onClick={() => setComposing(true)}
                  >
                    <Plus size={15} /> Add person
                  </button>
                </div>
              )
            ) : activeTeam ? (
              <TeamEditor
                key={activeTeam.id}
                team={activeTeam}
                people={people}
                onSave={(changes) => updateTeam(activeTeam.id, changes)}
                onRemove={() => {
                  removeTeam(activeTeam.id);
                  setSelectedTeamId(undefined);
                }}
              />
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
