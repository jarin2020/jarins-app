"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  ChevronRight,
  Crown,
  MessageCircle,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useTeamWorkspace, type Team } from "@/lib/team-workspace";

const TASK_KINDS = ["Deliverable", "Deadline", "Focus", "Meeting", "Blocker"];

function dateLabel(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
}

/**
 * A team as somewhere work happens: who is in it, what each person's role is,
 * and what has been handed to whom.
 *
 * Owners see the controls; members see the team and their own work. The
 * database decides either way — `can_manage_message_team` and the record
 * policies are the boundary, and this only chooses what to draw.
 */
export function TeamsWorkspace() {
  const { supabase, user, householdId, status } = useAuth();
  const workspace = useTeamWorkspace({
    supabase,
    userId: user?.id,
    householdId,
  });
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskKind, setTaskKind] = useState(TASK_KINDS[0]);
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "member">("member");
  const [inviteLink, setInviteLink] = useState("");

  // Two tabs only when there is genuinely a distinction to draw. Somebody who
  // only belongs to teams should not be asked to choose between "mine" and
  // "all" when those are the same list.
  const owned = workspace.teams.filter((item) => item.canManage);
  const joined = workspace.teams.filter((item) => !item.canManage);
  const split = owned.length > 0 && joined.length > 0;
  const [scope, setScope] = useState<"owned" | "joined">("owned");
  const listed = split ? (scope === "owned" ? owned : joined) : workspace.teams;

  const team: Team | undefined =
    listed.find((item) => item.id === selectedId) ?? listed[0];

  const teamTasks = useMemo(
    () => workspace.tasks.filter((task) => task.teamId === team?.id),
    [workspace.tasks, team?.id],
  );
  const mine = teamTasks.filter((task) => task.assigneeUserId === user?.id);
  const unassigned = teamTasks.filter((task) => !task.assigneeUserId);

  const run = async (operation: Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await operation;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  const notInTeam = workspace.directory.filter(
    (person) =>
      !team?.members.some((member) => member.userId === person.user_id),
  );

  if (status !== "signed-in")
    return (
      <div className="data-warning" role="note">
        <strong>Teams need an account.</strong>
        <p>
          A team is people, and people are accounts — sign in to create one and
          invite the rest.
        </p>
      </div>
    );

  return (
    <div className="teams-workspace">
      <aside className="teams-list" aria-label="Your teams">
        <header>
          <strong>Your teams</strong>
          <small>{workspace.teams.length}</small>
        </header>
        {split && (
          <div className="teams-scope" role="tablist" aria-label="Which teams">
            <button
              type="button"
              role="tab"
              aria-selected={scope === "owned"}
              className={scope === "owned" ? "active" : ""}
              onClick={() => {
                setScope("owned");
                setSelectedId(undefined);
              }}
            >
              You own <small>{owned.length}</small>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === "joined"}
              className={scope === "joined" ? "active" : ""}
              onClick={() => {
                setScope("joined");
                setSelectedId(undefined);
              }}
            >
              You are in <small>{joined.length}</small>
            </button>
          </div>
        )}
        {workspace.loading && workspace.teams.length === 0 && (
          <p className="muted">Loading teams…</p>
        )}
        {!workspace.loading && workspace.teams.length === 0 && (
          <p className="muted">
            No teams yet. Marketing, Product, HR — whatever the work is
            organised around.
          </p>
        )}
        {listed.map((item) => (
          <button
            type="button"
            key={item.id}
            className={item.id === team?.id ? "active" : ""}
            onClick={() => setSelectedId(item.id)}
          >
            <span>
              <UsersRound size={16} />
            </span>
            <div>
              <strong>{item.name}</strong>
              <small>
                {item.members.length} member
                {item.members.length === 1 ? "" : "s"}
                {item.myRole === "owner" ? " · you own this" : ""}
              </small>
            </div>
            <ChevronRight size={14} />
          </button>
        ))}
        {creating ? (
          <form
            className="teams-new"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newTeamName.trim()) return;
              void run(
                workspace.createTeam(newTeamName).then((id) => {
                  setSelectedId(id);
                  setNewTeamName("");
                  setCreating(false);
                }),
              );
            }}
          >
            <input
              autoFocus
              aria-label="Team name"
              placeholder="Marketing and Sales"
              value={newTeamName}
              maxLength={100}
              disabled={busy}
              onChange={(event) => setNewTeamName(event.target.value)}
            />
            <div>
              <button
                type="button"
                className="button secondary small"
                onClick={() => {
                  setCreating(false);
                  setNewTeamName("");
                }}
              >
                Cancel
              </button>
              <button
                className="button primary small"
                disabled={busy || !newTeamName.trim()}
              >
                Create
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="button secondary small"
            onClick={() => setCreating(true)}
          >
            <Plus size={15} /> New team
          </button>
        )}
      </aside>

      {team ? (
        <section className="teams-detail">
          <header>
            <div>
              <span className="eyebrow">
                {team.canManage ? "You own this team" : "You are a member"}
              </span>
              <h2>{team.name}</h2>
              {/* Who to ask. A member's first question about a team is who can
                  answer for it, and a list of names with roles buried below
                  makes them work it out. */}
              {(() => {
                const owners = team.members.filter(
                  (member) =>
                    member.role === "owner" && member.userId !== user?.id,
                );
                if (team.canManage && owners.length === 0)
                  return (
                    <p className="teams-reports-to">
                      You are the only owner — this team answers to you.
                    </p>
                  );
                if (owners.length === 0) return null;
                return (
                  <p className="teams-reports-to">
                    {team.canManage
                      ? "You share ownership with"
                      : "You report to"}{" "}
                    <strong>
                      {owners.map((member) => member.name).join(", ")}
                    </strong>
                  </p>
                );
              })()}
            </div>
            <button
              type="button"
              className="button secondary small"
              onClick={() =>
                window.dispatchEvent(new Event("jarins-open-messages"))
              }
            >
              <MessageCircle size={15} /> Team messages
            </button>
          </header>

          {(error || workspace.error) && (
            <p className="save-state is-error" role="alert">
              {error || workspace.error}
            </p>
          )}

          {/* ---- members ---- */}
          <section className="teams-card">
            <div className="profile-section-header">
              <h3>Members</h3>
              <span className="profile-visibility is-always">
                <UsersRound size={12} /> {team.members.length}
              </span>
            </div>
            <div className="directory-member-list">
              {team.members.map((member) => (
                <article key={member.userId}>
                  <span>
                    {member.role === "owner" ? (
                      <Crown size={15} />
                    ) : (
                      <UserRound size={15} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {member.name}
                      {member.userId === user?.id && <small>You</small>}
                    </strong>
                    <small>{member.email}</small>
                  </div>
                  {team.canManage ? (
                    <span className="teams-member-actions">
                      <select
                        aria-label={`Role for ${member.name}`}
                        value={member.role}
                        disabled={busy}
                        onChange={(event) =>
                          void run(
                            workspace.setRole(
                              team.id,
                              member.userId,
                              event.target.value as "owner" | "member",
                            ),
                          )
                        }
                      >
                        <option value="owner">Owner</option>
                        <option value="member">Member</option>
                      </select>
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label={`Remove ${member.name}`}
                        disabled={busy}
                        onClick={() =>
                          void run(
                            workspace.setMembers(
                              team,
                              team.members
                                .filter((row) => row.userId !== member.userId)
                                .map((row) => row.userId),
                            ),
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </span>
                  ) : (
                    <em>{member.role}</em>
                  )}
                </article>
              ))}
            </div>

            {team.canManage && notInTeam.length > 0 && (
              <div className="teams-add-member">
                <label className="input-row">
                  Add someone from your household
                  <select
                    aria-label="Add a member"
                    value=""
                    disabled={busy}
                    onChange={(event) => {
                      if (!event.target.value) return;
                      void run(
                        workspace.setMembers(team, [
                          ...team.members.map((row) => row.userId),
                          event.target.value,
                        ]),
                      );
                    }}
                  >
                    <option value="">Choose a person…</option>
                    {notInTeam.map((person) => (
                      <option key={person.user_id} value={person.user_id}>
                        {person.display_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {team.canManage && !workspace.isHouseholdOwner && (
              <p className="muted teams-member-note">
                <ShieldCheck size={13} /> Adding someone who is not here yet is
                the household owner&apos;s to do — joining a team means joining
                the household around it. Ask them to invite the person, then add
                them above.
              </p>
            )}
            {team.canManage && workspace.isHouseholdOwner && (
              <form
                className="teams-invite"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!inviteEmail.trim()) return;
                  setInviteLink("");
                  void run(
                    workspace
                      .inviteToTeam(team.id, inviteEmail, inviteRole)
                      .then((token) => {
                        setInviteLink(
                          `${window.location.origin}/auth/invite/${token}`,
                        );
                        setInviteEmail("");
                      }),
                  );
                }}
              >
                <div className="profile-section-header">
                  <h3>Invite someone new</h3>
                </div>
                <p className="muted">
                  <UserPlus size={13} /> They join the household and this team
                  at once, with the access you choose here.
                </p>
                <div className="teams-invite-row">
                  <input
                    type="email"
                    aria-label="Email address"
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    maxLength={320}
                    disabled={busy}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                  <select
                    aria-label="Access level"
                    value={inviteRole}
                    disabled={busy}
                    onChange={(event) =>
                      setInviteRole(event.target.value as "owner" | "member")
                    }
                  >
                    <option value="member">Member</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    className="button primary small"
                    disabled={busy || !inviteEmail.trim()}
                  >
                    <UserPlus size={15} /> Invite
                  </button>
                </div>
                {inviteLink && (
                  <div className="teams-invite-link">
                    <input
                      readOnly
                      value={inviteLink}
                      aria-label="Invitation link"
                    />
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() =>
                        void navigator.clipboard.writeText(inviteLink)
                      }
                    >
                      <Copy size={14} /> Copy
                    </button>
                  </div>
                )}
              </form>
            )}
          </section>

          {/* ---- work ---- */}
          <section className="teams-card">
            <div className="profile-section-header">
              <h3>{team.canManage ? "Assigned work" : "Your work"}</h3>
              <span className="profile-visibility is-private">
                {mine.length} yours · {unassigned.length} unassigned
              </span>
            </div>

            {team.canManage && (
              <form
                className="teams-task-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!taskTitle.trim()) return;
                  void run(
                    workspace
                      .addTask({
                        teamId: team.id,
                        title: taskTitle,
                        kind: taskKind,
                        assigneeUserId: taskAssignee || null,
                        date: taskDate,
                      })
                      .then(() => {
                        setTaskTitle("");
                        setTaskAssignee("");
                        setTaskDate("");
                      }),
                  );
                }}
              >
                <input
                  aria-label="Task"
                  placeholder="What needs doing?"
                  value={taskTitle}
                  maxLength={200}
                  disabled={busy}
                  onChange={(event) => setTaskTitle(event.target.value)}
                />
                <select
                  aria-label="Kind"
                  value={taskKind}
                  disabled={busy}
                  onChange={(event) => setTaskKind(event.target.value)}
                >
                  {TASK_KINDS.map((kind) => (
                    <option key={kind}>{kind}</option>
                  ))}
                </select>
                <select
                  aria-label="Assign to"
                  value={taskAssignee}
                  disabled={busy}
                  onChange={(event) => setTaskAssignee(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {team.members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Due"
                  type="date"
                  value={taskDate}
                  disabled={busy}
                  onChange={(event) => setTaskDate(event.target.value)}
                />
                <button
                  className="button primary small"
                  disabled={busy || !taskTitle.trim()}
                >
                  <Plus size={15} /> Assign
                </button>
              </form>
            )}

            {teamTasks.length === 0 ? (
              <p className="muted">
                Nothing assigned yet.
                {team.canManage
                  ? " Add the first piece of work above."
                  : " An owner will assign work to this team."}
              </p>
            ) : (
              <div className="self-action-list">
                {teamTasks.map((task) => {
                  const assignee = team.members.find(
                    (member) => member.userId === task.assigneeUserId,
                  );
                  // The policy lets the assignee, the author and a team owner
                  // move a task; everyone else reads it.
                  const canFinish =
                    team.canManage || task.assigneeUserId === user?.id;
                  return (
                    <article key={task.id}>
                      <button
                        type="button"
                        aria-label={`Complete ${task.title}`}
                        disabled={busy || !canFinish || task.status === "done"}
                        onClick={() =>
                          void run(
                            workspace.updateTask(task.id, { status: "done" }),
                          )
                        }
                      >
                        <Check size={14} />
                      </button>
                      <div>
                        <strong>{task.title}</strong>
                        <small>
                          {task.kind}
                          {assignee ? ` · ${assignee.name}` : " · unassigned"}
                          {task.date ? ` · ${dateLabel(task.date)}` : ""}
                        </small>
                      </div>
                      <span className={task.status === "done" ? "" : "overdue"}>
                        {task.status === "done" ? "Done" : task.status}
                      </span>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {!team.canManage && (
            <p className="muted teams-member-note">
              <ShieldCheck size={13} /> You can finish what is assigned to you.
              Adding people, assigning work and renaming the team are an
              owner&apos;s to do.
            </p>
          )}
        </section>
      ) : (
        <section className="teams-detail teams-empty">
          <UsersRound size={22} />
          <strong>No team selected</strong>
          <p>
            Teams are created in Messages, where the conversation lives. Once
            one exists, this is where its people and its work are managed.
          </p>
        </section>
      )}
    </div>
  );
}
