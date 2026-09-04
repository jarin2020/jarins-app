"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useMemo } from "react";
import { useLifeRecords } from "@/lib/jarins-store";
import { usePreferences } from "@/lib/preferences-store";
import { useAuth } from "./auth-provider";

export function TodayView() {
  const { records, loading, error, update } = useLifeRecords();
  const { preferences } = usePreferences();
  const { profile, status: authStatus } = useAuth();
  const accountPreferences =
    authStatus === "signed-in" && profile
      ? {
          name: profile.displayName,
          locale: profile.locale,
          timezone: profile.timezone,
        }
      : preferences;
  const essentials = useMemo(
    () => records.filter((item) => item.essential).slice(0, 7),
    [records],
  );
  const status = useMemo(
    () => essentials.filter((item) => item.status === "done").length,
    [essentials],
  );
  const future = records
    .filter((item) => item.module === "future" && item.status !== "done")
    .slice(0, 3);
  const outcomes = future.map((item, index) => ({
    area: item.kind,
    title: item.title,
    note: item.detail,
    progress: item.progress ?? 0,
    tone: ["family", "self", "career"][index],
  }));
  const todayKey = new Date().toISOString().slice(0, 10);
  const datedRecords = records
    .filter(
      (item) => item.date && item.date >= todayKey && item.status !== "done",
    )
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .slice(0, 5);
  const schedule = datedRecords.map((item) => ({
    time:
      item.date === todayKey
        ? "Today"
        : new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(
            new Date(`${item.date}T12:00:00`),
          ),
    title: item.title,
    meta: `${item.kind} · ${item.module}`,
    tone:
      item.module === "family"
        ? "family"
        : item.module === "career" || item.module === "learning"
          ? "career"
          : item.module === "money"
            ? "warm"
            : "green",
  }));
  const bridge = records.find(
    (item) =>
      ["learning", "career"].includes(item.module) && item.status !== "done",
  );
  // Previously four hard-coded strings rendered next to live data.
  const milestones = useMemo(
    () =>
      records
        .filter(
          (item) =>
            (item.module === "learning" || item.module === "career") &&
            item.kind !== "Task",
        )
        .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"))
        .slice(0, 4),
    [records],
  );
  const prompts = preferences.reminders ? datedRecords.slice(0, 2) : [];
  const greeting =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 18
        ? "Good afternoon"
        : "Good evening";
  const date = (() => {
    try {
      return new Intl.DateTimeFormat(
        accountPreferences.locale === "de" ? "de-DE" : "en-GB",
        {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: accountPreferences.timezone,
        },
      ).format(new Date());
    } catch {
      return new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date());
    }
  })();
  return (
    <>
      {error && (
        <p className="data-error" role="alert">
          {error}
        </p>
      )}
      <section className="today-hero">
        <div className="hero-message">
          <span className="eyebrow light">{date}</span>
          <h1>
            {greeting}, {accountPreferences.name}.<br />
            Let’s protect the essentials.
          </h1>
          <p>
            Three meaningful priorities are enough. Everything else can wait,
            move, or become smaller.
          </p>
          <div className="hero-actions">
            <Link href="/reset/weekly" className="button light">
              <CalendarCheck size={17} /> Plan the week
            </Link>
            <Link href="/self/protected-time" className="button glass">
              Make today lighter
            </Link>
          </div>
        </div>
        <div className="essentials-snapshot">
          <div className="card-heading">
            <div>
              <span className="kicker">Today snapshot</span>
              <h2>Balanced, not perfect</h2>
            </div>
            <span className="status good">On track</span>
          </div>
          <div className="snapshot-main">
            <div className="count-ring">
              <strong>{status}</strong>
              <span>of {essentials.length}</span>
            </div>
            <div>
              <strong>Enough for today</strong>
              <p>User-chosen essentials — no hidden score.</p>
            </div>
          </div>
          <div className="soft-notice">
            <Sparkles size={16} />
            <span>
              Protect your evening energy. The minimum version counts.
            </span>
          </div>
        </div>
      </section>

      <section aria-labelledby="top-three-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Your focus</span>
            <h2 id="top-three-title">Today’s top three</h2>
          </div>
          <Link href="/future/goals" className="text-button">
            Edit outcomes <ChevronRight size={15} />
          </Link>
        </div>
        {outcomes.length ? (
          <div className="outcome-grid">
            {outcomes.map((item, index) => (
              <article className={`outcome-card ${item.tone}`} key={item.title}>
                <div className="outcome-top">
                  <span>
                    {String(index + 1).padStart(2, "0")} · {item.area}
                  </span>
                  <Link href="/future/goals" aria-label={`Open ${item.title}`}>
                    <ArrowRight size={17} />
                  </Link>
                </div>
                <h3>{item.title}</h3>
                <p>{item.note}</p>
                <div
                  className="progress-track"
                  aria-label={`${item.progress}% complete`}
                >
                  <span style={{ width: `${item.progress}%` }} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state-inline">
            <div>
              <h2>Choose one meaningful direction</h2>
              <p>Add a Future goal and it will appear here.</p>
            </div>
            <Link className="button secondary" href="/future/goals">
              Add a goal
            </Link>
          </div>
        )}
      </section>

      <div className="two-column">
        <section className="surface-card">
          <div className="card-heading">
            <div>
              <span className="kicker">Next up</span>
              <h2>Today’s flow</h2>
            </div>
            <span className="status">{schedule.length} items</span>
          </div>
          {loading ? (
            <div className="today-empty" aria-live="polite">
              <strong>Loading…</strong>
            </div>
          ) : schedule.length ? (
            <div className="timeline-list">
              {schedule.map((event) => (
                <div
                  className="timeline-item"
                  key={`${event.time}-${event.title}`}
                >
                  <time>{event.time}</time>
                  <span className={`timeline-marker ${event.tone}`} />
                  <div>
                    <strong>{event.title}</strong>
                    <p>{event.meta}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="today-empty">
              <strong>Your flow is open</strong>
              <p>Add a date to any item and it will appear here.</p>
            </div>
          )}
        </section>
        <section className="surface-card">
          <div className="card-heading">
            <div>
              <span className="kicker">Essentials</span>
              <h2>Only what matters</h2>
            </div>
            <span className="status good">{status} done</span>
          </div>
          <div className="check-list">
            {loading ? (
              <div className="today-empty" aria-live="polite">
                <strong>Loading…</strong>
              </div>
            ) : essentials.length ? (
              essentials.map((item) => (
                <label
                  key={item.id}
                  className={item.status === "done" ? "done" : ""}
                >
                  <input
                    type="checkbox"
                    checked={item.status === "done"}
                    onChange={() =>
                      update(item.id, {
                        status: item.status === "done" ? "open" : "done",
                        progress: item.status === "done" ? item.progress : 100,
                      })
                    }
                  />
                  <span className="custom-check">
                    {item.status === "done" && <Check size={13} />}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.kind} · {item.module}
                    </small>
                  </span>
                </label>
              ))
            ) : (
              <div className="today-empty">
                <strong>Choose your essentials</strong>
                <p>Mark an item as a Today essential from any life area.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="two-column uneven">
        <section className="surface-card">
          <div className="card-heading">
            <div>
              <span className="kicker">Career bridge</span>
              <h2>One next action</h2>
            </div>
            <span className="status warm">Future</span>
          </div>
          <div className="bridge-action">
            <span className="feature-icon career">
              <Sparkles size={20} />
            </span>
            <div>
              <strong>
                {bridge?.title ?? "Add a learning or career action"}
              </strong>
              <p>
                {bridge?.detail ??
                  "Keep the next step small enough to begin today."}
              </p>
            </div>
            <Link
              href={bridge ? `/${bridge.module}` : "/career"}
              className="round-arrow"
              aria-label="Open action"
            >
              <ArrowRight size={18} />
            </Link>
          </div>
          {milestones.length > 0 && (
            <div className="milestone-row">
              {milestones.map((step, index) => (
                <div
                  key={step.id}
                  className={
                    step.status === "done"
                      ? "complete"
                      : step.status === "in-progress"
                        ? "active"
                        : ""
                  }
                >
                  <span>
                    {step.status === "done" ? <Check size={13} /> : index + 1}
                  </span>
                  <strong>{step.title}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="surface-card risk-card">
          <div className="card-heading">
            <div>
              <span className="kicker">Memory prompts</span>
              <h2>Before it becomes urgent</h2>
            </div>
            <CircleAlert size={19} />
          </div>
          {prompts.length ? (
            prompts.map((item, index) => (
              <Link
                href={`/${item.module}`}
                className="risk-item"
                key={item.id}
              >
                <span className={`feature-icon ${index ? "family" : "warm"}`}>
                  {index ? <CalendarCheck size={18} /> : <Clock3 size={18} />}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {item.date === todayKey
                      ? "Due today"
                      : `Due ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${item.date}T12:00:00`))}`}{" "}
                    · {item.module}
                  </p>
                </div>
              </Link>
            ))
          ) : (
            <p className="muted">
              {preferences.reminders
                ? "No upcoming deadlines. Add dates in any life area to see them here."
                : "Reminders are turned off in Settings."}
            </p>
          )}
        </section>
      </div>

      <section className="reset-banner">
        <span className="feature-icon warm">
          <RotateCcw size={22} />
        </span>
        <div>
          <span className="kicker">Sunday ritual</span>
          <h2>Your weekly reset</h2>
          <p>
            Empty the inbox, check the next 14 days, choose three outcomes and
            protect one future-building block.
          </p>
        </div>
        <Link href="/reset/weekly" className="button dark">
          Start guided reset <ArrowRight size={16} />
        </Link>
      </section>
    </>
  );
}
