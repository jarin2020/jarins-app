"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronRight, CircleAlert, Inbox, Users } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import type { LifeRecord } from "@/lib/jarins-store";
import { useTeamWorkspace } from "@/lib/team-workspace";
import { useClientNow } from "@/lib/use-client-now";
import { moduleLabels } from "@/lib/records/schema";

type Props = {
  records: LifeRecord[];
  loading: boolean;
  update: (id: string, changes: Partial<LifeRecord>) => Promise<void>;
};

function localDateKey(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
}

/**
 * Everything that is yours, wherever it lives.
 *
 * The Dashboard answers "what is the state of the work"; this answers "what am
 * I supposed to be doing". Two different questions, and mixing them is how a
 * person ends up scanning a team's whole backlog to find their own three
 * things.
 *
 * Assigned work comes from the team tables and personal work from the record
 * store, because those are genuinely different sources — one is somebody
 * handing you something, the other is you writing it down.
 */
export function MyWork({ records, loading, update }: Props) {
  const now = useClientNow();
  const today = now ? localDateKey(now) : "";
  const { supabase, user, householdId, status } = useAuth();
  const teams = useTeamWorkspace({
    supabase,
    userId: user?.id,
    householdId,
  });
  const [busy, setBusy] = useState(false);

  const assigned = teams.tasks
    .filter(
      (task) => task.assigneeUserId === user?.id && task.status !== "done",
    )
    .map((task) => ({
      ...task,
      teamName:
        teams.teams.find((team) => team.id === task.teamId)?.name ?? "A team",
    }))
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));

  // Yours because you wrote it: professional records with nobody else's name
  // on them. Family and Home are the household's and belong on Today.
  const personal = records
    .filter((record) =>
      ["work", "pipeline", "portfolio", "network", "career"].includes(
        record.module,
      ),
    )
    .filter((record) => record.status !== "done")
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));

  const overdue = [...assigned, ...personal].filter(
    (item) => item.date && today && item.date < today,
  ).length;

  const complete = (id: string, fromTeam: boolean) => {
    setBusy(true);
    const operation = fromTeam
      ? teams.updateTask(id, { status: "done" })
      : update(id, { status: "done", progress: 100 });
    void operation.finally(() => setBusy(false));
  };

  const stat = (value: number) => (loading ? "—" : String(value));

  if (status !== "signed-in")
    return (
      <div className="data-warning" role="note">
        <strong>My work needs an account.</strong>
        <p>
          Work is assigned to a person, and a person is an account. Sign in to
          see what is yours.
        </p>
      </div>
    );

  return (
    <div className="my-work">
      <section className="status-tiles" aria-label="Your work">
        <article>
          <span className="status-tile-icon urgent">
            <CircleAlert size={17} />
          </span>
          <div>
            <strong>{stat(overdue)}</strong>
            <small>Overdue</small>
          </div>
        </article>
        <article>
          <span className="status-tile-icon">
            <Users size={17} />
          </span>
          <div>
            <strong>{stat(assigned.length)}</strong>
            <small>Assigned to you</small>
          </div>
        </article>
        <article>
          <span className="status-tile-icon career">
            <Inbox size={17} />
          </span>
          <div>
            <strong>{stat(personal.length)}</strong>
            <small>Yours to do</small>
          </div>
        </article>
      </section>

      <section
        className="self-dashboard-card actions"
        aria-labelledby="assigned-title"
      >
        <header>
          <div>
            <span className="eyebrow">Handed to you</span>
            <h2 id="assigned-title">Assigned by a team</h2>
          </div>
          <Link href="/teams" className="text-button">
            Teams <ChevronRight size={14} />
          </Link>
        </header>
        {assigned.length ? (
          <div className="self-action-list">
            {assigned.map((task) => (
              <article key={task.id}>
                <button
                  type="button"
                  aria-label={`Complete ${task.title}`}
                  disabled={busy}
                  onClick={() => complete(task.id, true)}
                >
                  <Check size={14} />
                </button>
                <div>
                  <strong>{task.title}</strong>
                  <small>
                    {task.kind} · {task.teamName}
                  </small>
                </div>
                <span
                  className={
                    task.date && today && task.date < today ? "overdue" : ""
                  }
                >
                  {task.date ? dateLabel(task.date) : "No date"}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="self-dashboard-empty">
            <Users size={19} />
            <strong>Nothing assigned to you</strong>
            <p>Work a team owner assigns to you appears here.</p>
          </div>
        )}
      </section>

      <section
        className="self-dashboard-card actions"
        aria-labelledby="personal-title"
      >
        <header>
          <div>
            <span className="eyebrow">Set by you</span>
            <h2 id="personal-title">Your own list</h2>
          </div>
          <Link href="/work" className="text-button">
            Dashboard <ChevronRight size={14} />
          </Link>
        </header>
        {personal.length ? (
          <div className="self-action-list">
            {personal.slice(0, 12).map((record) => (
              <article key={record.id}>
                <button
                  type="button"
                  aria-label={`Complete ${record.title}`}
                  disabled={busy}
                  onClick={() => complete(record.id, false)}
                >
                  <Check size={14} />
                </button>
                <Link href={`/${record.module}`}>
                  <strong>{record.title}</strong>
                  <small>
                    {record.kind} · {moduleLabels[record.module]}
                  </small>
                </Link>
                <span
                  className={
                    record.date && today && record.date < today ? "overdue" : ""
                  }
                >
                  {record.date ? dateLabel(record.date) : "Open"}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="self-dashboard-empty">
            <Inbox size={19} />
            <strong>Your list is clear</strong>
            <p>Anything you add on the Dashboard shows up here too.</p>
          </div>
        )}
      </section>
    </div>
  );
}
