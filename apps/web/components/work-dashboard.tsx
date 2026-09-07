"use client";

import Link from "next/link";
import {
  Ban,
  Check,
  ChevronRight,
  CircleAlert,
  Handshake,
  Plus,
  Route,
  Target,
  Timer,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { LifeRecord } from "@/lib/jarins-store";
import { useClientNow } from "@/lib/use-client-now";
import { dueByDay, pipelineFunnel, statusBreakdown } from "@/lib/work-metrics";
import { DueChart, FunnelChart, StatusChart } from "./work-charts";

type Props = {
  records: LifeRecord[];
  loading: boolean;
  update: (id: string, changes: Partial<LifeRecord>) => Promise<void>;
  add: (
    record: Omit<LifeRecord, "id" | "createdAt" | "updatedAt">,
  ) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
};

const WORK_KINDS = ["Focus", "Deliverable", "Deadline", "Meeting", "Blocker"];

function localDateKey(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value.includes("T") ? value : `${value}T12:00:00`));
}

/**
 * The professional workspace's landing page.
 *
 * Deliberately not a second Today. Today asks what matters; this asks what is
 * committed — what is due, what is moving, what is stuck, and what the next
 * move on an opportunity is. Everything reads from the same life_records the
 * rest of the app uses, filtered to the four professional modules.
 */
export function WorkDashboard({
  records,
  loading,
  update,
  add,
  remove,
}: Props) {
  const now = useClientNow();
  const today = now ? localDateKey(now) : "";

  const work = useMemo(
    () => records.filter((record) => record.module === "work"),
    [records],
  );
  const open = work.filter((record) => record.status !== "done");
  const overdue = open.filter((record) => record.date && record.date < today);
  const blocked = open.filter((record) => /blocker/i.test(record.kind));
  const inFlight = open.filter((record) => /deliverable/i.test(record.kind));
  const completed = work.filter((record) => record.status === "done").length;

  const dueSoon = open
    .filter((record) => record.date && record.date >= today)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .slice(0, 5);

  const pipeline = records.filter((record) => record.module === "pipeline");
  const pipelineNext = pipeline
    .filter((record) => record.status !== "done")
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"))
    .slice(0, 4);

  const followUps = records
    .filter((record) => record.module === "network")
    .filter((record) => record.status !== "done")
    .slice(0, 4);

  // Left for the React Compiler rather than hand-memoised: these are filters
  // and counts over a list already in memory, and a useMemo whose input is not
  // itself memoised is one the compiler has to skip the whole component over.
  const bars = statusBreakdown(work);
  const days = today ? dueByDay(work, today) : [];
  const funnel = pipelineFunnel(pipeline);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftKind, setDraftKind] = useState(WORK_KINDS[1]);
  const [draftDate, setDraftDate] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState<LifeRecord["status"]>("open");
  const [busy, setBusy] = useState(false);

  const openEditor = (record: LifeRecord) => {
    setEditing(record.id);
    setEditTitle(record.title);
    setEditDate(record.date ?? "");
    setEditStatus(record.status);
  };

  const run = async (operation: Promise<unknown>) => {
    setBusy(true);
    try {
      await operation;
    } finally {
      setBusy(false);
    }
  };

  const stat = (value: number) => (loading ? "—" : String(value));

  return (
    <div className="self-command-dashboard">
      <section className="self-dashboard-hero">
        <div>
          <span className="eyebrow light">Your working surface</span>
          <h2>What you have committed to, in one place.</h2>
          <p>
            Deadlines, deliverables and blockers — separated from the household,
            so neither has to compete with the other for attention.
          </p>
          <div className="self-hero-actions">
            <button
              type="button"
              className="button light"
              onClick={() =>
                window.dispatchEvent(new Event("jarins-open-capture"))
              }
            >
              <Plus size={15} /> Capture something
            </button>
            <Link href="/pipeline" className="button glass">
              <Route size={15} /> Open pipeline
            </Link>
          </div>
        </div>
        <div className="self-energy-summary">
          <span>In flight</span>
          <strong>{stat(inFlight.length)}</strong>
          <small>
            {inFlight.length === 0
              ? "Nothing started"
              : blocked.length
                ? `${blocked.length} blocked`
                : "All moving"}
          </small>
        </div>
      </section>

      <section className="self-dashboard-stats" aria-label="Work status">
        <article>
          <span className="urgent">
            <CircleAlert size={17} />
          </span>
          <div>
            <strong>{stat(overdue.length)}</strong>
            <small>Overdue</small>
          </div>
        </article>
        <article>
          <span>
            <Target size={17} />
          </span>
          <div>
            <strong>{stat(open.length)}</strong>
            <small>Open</small>
          </div>
        </article>
        <article>
          <span className="warm">
            <Ban size={17} />
          </span>
          <div>
            <strong>{stat(blocked.length)}</strong>
            <small>Blocked</small>
          </div>
        </article>
        <article>
          <span className="career">
            <Check size={17} />
          </span>
          <div>
            <strong>{stat(completed)}</strong>
            <small>Completed</small>
          </div>
        </article>
      </section>

      <div className="work-charts">
        <section aria-labelledby="chart-status">
          <header>
            <span className="eyebrow">Where it stands</span>
            <h2 id="chart-status">Work by status</h2>
          </header>
          <StatusChart bars={bars} />
        </section>
        <section aria-labelledby="chart-due">
          <header>
            <span className="eyebrow">The fortnight ahead</span>
            <h2 id="chart-due">What lands when</h2>
          </header>
          <DueChart days={days} />
        </section>
        <section aria-labelledby="chart-funnel">
          <header>
            <span className="eyebrow">Opportunities</span>
            <h2 id="chart-funnel">Pipeline by stage</h2>
          </header>
          <FunnelChart stages={funnel} />
        </section>
      </div>

      <section className="work-add" aria-labelledby="work-add-title">
        <div className="profile-section-header">
          <h3 id="work-add-title">Add to the week</h3>
        </div>
        <form
          className="teams-task-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draftTitle.trim()) return;
            void run(
              add({
                module: "work",
                kind: draftKind,
                title: draftTitle.trim(),
                detail: "",
                status: "open",
                ...(draftDate ? { date: draftDate } : {}),
              }).then(() => {
                setDraftTitle("");
                setDraftDate("");
              }),
            );
          }}
        >
          <input
            aria-label="What needs doing"
            placeholder="What needs doing?"
            value={draftTitle}
            maxLength={200}
            disabled={busy}
            onChange={(event) => setDraftTitle(event.target.value)}
          />
          <select
            aria-label="Kind"
            value={draftKind}
            disabled={busy}
            onChange={(event) => setDraftKind(event.target.value)}
          >
            {WORK_KINDS.map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
          <input
            aria-label="Due"
            type="date"
            value={draftDate}
            disabled={busy}
            onChange={(event) => setDraftDate(event.target.value)}
          />
          <button
            className="button primary small"
            disabled={busy || !draftTitle.trim()}
          >
            <Plus size={15} /> Add
          </button>
        </form>
      </section>

      <div className="self-dashboard-grid">
        <section
          className="self-dashboard-card actions"
          aria-labelledby="work-due-title"
        >
          <header>
            <div>
              <span className="eyebrow">Committed</span>
              <h2 id="work-due-title">What is due next</h2>
            </div>
            <Link href="/work/deadlines" className="text-button">
              All deadlines <ChevronRight size={14} />
            </Link>
          </header>
          {dueSoon.length ? (
            <div className="self-action-list">
              {dueSoon.map((record) =>
                editing === record.id ? (
                  <form
                    className="work-edit"
                    key={record.id}
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!editTitle.trim()) return;
                      void run(
                        update(record.id, {
                          title: editTitle.trim(),
                          status: editStatus,
                          ...(editDate ? { date: editDate } : {}),
                        }).then(() => setEditing(null)),
                      );
                    }}
                  >
                    <input
                      autoFocus
                      aria-label={`Title of ${record.title}`}
                      value={editTitle}
                      maxLength={200}
                      disabled={busy}
                      onChange={(event) => setEditTitle(event.target.value)}
                    />
                    <input
                      aria-label={`Due date of ${record.title}`}
                      type="date"
                      value={editDate}
                      disabled={busy}
                      onChange={(event) => setEditDate(event.target.value)}
                    />
                    <select
                      aria-label={`Status of ${record.title}`}
                      value={editStatus}
                      disabled={busy}
                      onChange={(event) =>
                        setEditStatus(
                          event.target.value as LifeRecord["status"],
                        )
                      }
                    >
                      <option value="open">Open</option>
                      <option value="in-progress">In progress</option>
                      <option value="paused">Paused</option>
                      <option value="done">Done</option>
                    </select>
                    <button className="button primary small" disabled={busy}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      aria-label={`Delete ${record.title}`}
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`Delete “${record.title}”?`))
                          return;
                        void run(
                          remove(record.id).then(() => setEditing(null)),
                        );
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </form>
                ) : (
                  <article key={record.id}>
                    <button
                      type="button"
                      aria-label={`Complete ${record.title}`}
                      disabled={busy}
                      onClick={() =>
                        void update(record.id, {
                          status: "done",
                          progress: 100,
                        })
                      }
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      className="work-item-open"
                      aria-label={`Edit ${record.title}`}
                      onClick={() => openEditor(record)}
                    >
                      <strong>{record.title}</strong>
                      <small>
                        {record.kind}
                        {record.detail ? ` · ${record.detail}` : ""}
                      </small>
                    </button>
                    <span className={record.date === today ? "overdue" : ""}>
                      {record.date === today
                        ? "Today"
                        : dateLabel(record.date as string)}
                    </span>
                  </article>
                ),
              )}
            </div>
          ) : (
            <div className="self-dashboard-empty">
              <Timer size={19} />
              <strong>Nothing is due</strong>
              <p>
                Give a deliverable or a deadline a date and it will appear here.
              </p>
            </div>
          )}
        </section>

        <section
          className="self-dashboard-card agenda"
          aria-labelledby="work-pipeline-title"
        >
          <header>
            <div>
              <span className="eyebrow">Opportunities</span>
              <h2 id="work-pipeline-title">Next move</h2>
            </div>
            <Link href="/pipeline" className="text-button">
              Pipeline <ChevronRight size={14} />
            </Link>
          </header>
          {pipelineNext.length ? (
            <div className="self-agenda-list">
              {pipelineNext.map((record) => (
                <Link href="/pipeline" key={record.id}>
                  <time>
                    {record.date ? dateLabel(record.date) : "No date"}
                  </time>
                  <span>
                    <strong>{record.title}</strong>
                    <small>{record.kind}</small>
                  </span>
                  <ChevronRight size={14} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="self-dashboard-empty">
              <Route size={19} />
              <strong>The pipeline is empty</strong>
              <p>Add a role or an application and its next step shows here.</p>
            </div>
          )}
        </section>

        <section
          className="self-dashboard-card agenda"
          aria-labelledby="work-network-title"
        >
          <header>
            <div>
              <span className="eyebrow">People</span>
              <h2 id="work-network-title">Worth a message</h2>
            </div>
            <Link href="/network/follow-ups" className="text-button">
              Network <ChevronRight size={14} />
            </Link>
          </header>
          {followUps.length ? (
            <div className="self-agenda-list">
              {followUps.map((record) => (
                <Link href="/network" key={record.id}>
                  <time>{record.kind}</time>
                  <span>
                    <strong>{record.title}</strong>
                    <small>{record.detail || "No note yet"}</small>
                  </span>
                  <ChevronRight size={14} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="self-dashboard-empty">
              <Handshake size={19} />
              <strong>No one is waiting</strong>
              <p>
                Contacts and follow-ups you add to Network surface here before
                they go cold.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
