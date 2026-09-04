"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Footprints,
  Heart,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useCalendarEvents } from "@/lib/calendar-accounts";
import type { LifeRecord } from "@/lib/jarins-store";

type Props = {
  records: LifeRecord[];
  loading: boolean;
  update: (id: string, changes: Partial<LifeRecord>) => Promise<void>;
};

const energyLabels = ["Very low", "Low", "Okay", "Good", "Full"];

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

export function SelfDashboard({ records, loading, update }: Props) {
  const { supabase, user, status } = useAuth();
  const calendar = useCalendarEvents(user?.id ?? "local", supabase);
  const today = localDateKey();
  const energyKey = `jarins-energy-${today}`;
  const [energy, setEnergy] = useState(3);

  useEffect(() => {
    queueMicrotask(() => {
      const saved = Number(localStorage.getItem(energyKey));
      if (saved >= 1 && saved <= 5) setEnergy(saved);
    });
  }, [energyKey]);

  const chooseEnergy = (value: number) => {
    setEnergy(value);
    localStorage.setItem(energyKey, String(value));
  };
  const selfRecords = useMemo(
    () => records.filter((record) => record.module === "self"),
    [records],
  );
  const open = useMemo(
    () => selfRecords.filter((record) => record.status !== "done"),
    [selfRecords],
  );
  const actions = useMemo(
    () =>
      [...open]
        .sort((a, b) => {
          if (Boolean(a.essential) !== Boolean(b.essential))
            return a.essential ? -1 : 1;
          return (a.date ?? "9999").localeCompare(b.date ?? "9999");
        })
        .slice(0, 7),
    [open],
  );
  const overdue = open.filter(
    (record) => record.date && record.date < today,
  ).length;
  const completed = selfRecords.filter(
    (record) => record.status === "done",
  ).length;
  const essentials = open.filter((record) => record.essential).length;
  const personalCalendar = calendar.events
    .filter(
      (event) =>
        event.ownerUserId === user?.id &&
        event.endsAt >= new Date().toISOString(),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const datedSelf = open
    .filter((record) => record.date && record.date >= today)
    .map((record) => ({
      id: `self:${record.id}`,
      title: record.title,
      startsAt: `${record.date}T12:00:00`,
      source: record.kind,
      href: "/self",
    }));
  const agenda = [
    ...personalCalendar.map((event) => ({
      id: `calendar:${event.id}`,
      title: event.title,
      startsAt: event.startsAt,
      source: event.sourceName,
      href: "/calendar",
    })),
    ...datedSelf,
  ]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 7);
  const routines = selfRecords.filter((record) => /routine/i.test(record.kind));
  const protectedTime = selfRecords.filter((record) =>
    /protected/i.test(record.kind),
  );
  const reflections = selfRecords.filter((record) =>
    /reflection|check-in/i.test(record.kind),
  );
  const direction = ["learning", "career", "future"].map((module) => {
    const items = records.filter((record) => record.module === module);
    return {
      module,
      open: items.filter((record) => record.status !== "done").length,
      next: items.find((record) => record.status !== "done"),
    };
  });

  return (
    <div className="self-command-dashboard">
      <section className="self-dashboard-hero">
        <div>
          <span className="eyebrow light">Your personal control surface</span>
          <h2>Make space for yourself in the system.</h2>
          <p>
            See your energy, commitments, personal events, and next actions in
            one calm view.
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
            <Link href="/self/protected-time" className="button glass">
              <ShieldCheck size={15} /> Protect time
            </Link>
          </div>
        </div>
        <div className="self-energy-summary">
          <span>
            {status === "demo" ? "Saved on this device" : "Today’s check-in"}
          </span>
          <strong>{energy}</strong>
          <small>{energyLabels[energy - 1]} energy</small>
        </div>
      </section>

      <section
        className="self-checkin-card"
        aria-labelledby="self-checkin-title"
      >
        <div>
          <span className="self-section-icon">
            <Heart size={19} />
          </span>
          <div>
            <span className="eyebrow">Check in before planning</span>
            <h2 id="self-checkin-title">How are you arriving today?</h2>
            <p>
              {energy <= 2
                ? "Keep today gentle: water, get dressed, and choose one small action."
                : "You have room for an ideal routine, while the minimum still counts."}
            </p>
          </div>
        </div>
        <div
          className="self-energy-scale"
          role="group"
          aria-label="Energy level"
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              type="button"
              className={energy === value ? "active" : ""}
              onClick={() => chooseEnergy(value)}
              key={value}
              aria-pressed={energy === value}
            >
              <strong>{value}</strong>
              <span>{energyLabels[value - 1]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="self-dashboard-stats" aria-label="Personal status">
        <article>
          <span className="urgent">
            <CircleAlert size={17} />
          </span>
          <div>
            <strong>{loading ? "—" : overdue}</strong>
            <small>Overdue</small>
          </div>
        </article>
        <article>
          <span>
            <Target size={17} />
          </span>
          <div>
            <strong>{loading ? "—" : open.length}</strong>
            <small>Open actions</small>
          </div>
        </article>
        <article>
          <span className="warm">
            <Sparkles size={17} />
          </span>
          <div>
            <strong>{loading ? "—" : essentials}</strong>
            <small>Essentials</small>
          </div>
        </article>
        <article>
          <span className="career">
            <Check size={17} />
          </span>
          <div>
            <strong>{loading ? "—" : completed}</strong>
            <small>Completed</small>
          </div>
        </article>
      </section>

      <div className="self-dashboard-grid">
        <section
          className="self-dashboard-card actions"
          aria-labelledby="personal-actions-title"
        >
          <header>
            <div>
              <span className="eyebrow">Personal actions</span>
              <h2 id="personal-actions-title">Your next moves</h2>
            </div>
            <Link href="/self" className="text-button">
              View Self <ChevronRight size={14} />
            </Link>
          </header>
          {actions.length ? (
            <div className="self-action-list">
              {actions.map((record) => (
                <article key={record.id}>
                  <button
                    type="button"
                    aria-label={`Complete ${record.title}`}
                    onClick={() =>
                      void update(record.id, { status: "done", progress: 100 })
                    }
                  >
                    <Check size={14} />
                  </button>
                  <Link
                    href={`/self/${record.kind.toLowerCase().replaceAll(" ", "-")}`}
                  >
                    <strong>{record.title}</strong>
                    <small>
                      {record.kind}
                      {record.detail ? ` · ${record.detail}` : ""}
                    </small>
                  </Link>
                  <span
                    className={
                      record.date && record.date < today ? "overdue" : ""
                    }
                  >
                    {record.date
                      ? record.date === today
                        ? "Today"
                        : dateLabel(record.date)
                      : record.essential
                        ? "Essential"
                        : "Open"}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <div className="self-dashboard-empty">
              <Check size={20} />
              <strong>Your personal queue is clear</strong>
              <p>
                Capture a thought, reflection, or next action when it appears.
              </p>
            </div>
          )}
        </section>

        <section
          className="self-dashboard-card agenda"
          aria-labelledby="personal-agenda-title"
        >
          <header>
            <div>
              <span className="eyebrow">Personal calendar</span>
              <h2 id="personal-agenda-title">Your upcoming events</h2>
            </div>
            <Link href="/calendar" className="text-button">
              Full calendar <ChevronRight size={14} />
            </Link>
          </header>
          {calendar.error ? (
            <p className="self-dashboard-error">{calendar.error}</p>
          ) : agenda.length ? (
            <div className="self-agenda-list">
              {agenda.map((event) => (
                <Link href={event.href} key={event.id}>
                  <time>{dateLabel(event.startsAt)}</time>
                  <span>
                    <strong>{event.title}</strong>
                    <small>{event.source}</small>
                  </span>
                  <ChevronRight size={14} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="self-dashboard-empty">
              <CalendarDays size={20} />
              <strong>No personal events ahead</strong>
              <p>
                Your own connected-calendar events and dated Self items appear
                here.
              </p>
            </div>
          )}
        </section>
      </div>

      <section
        className="self-practice-overview"
        aria-labelledby="self-practices-title"
      >
        <header>
          <div>
            <span className="eyebrow">Personal practices</span>
            <h2 id="self-practices-title">Care, reflection, and consistency</h2>
          </div>
        </header>
        <div>
          <Link href="/self/routines">
            <span className="self-practice-icon">
              <Footprints size={19} />
            </span>
            <div>
              <strong>Routines</strong>
              <small>{routines.length} saved</small>
              <p>Keep repeatable actions realistic for your energy.</p>
            </div>
            <ArrowRight size={15} />
          </Link>
          <Link href="/self/protected-time">
            <span className="self-practice-icon warm">
              <Clock3 size={19} />
            </span>
            <div>
              <strong>Protected time</strong>
              <small>{protectedTime.length} blocks</small>
              <p>Reserve recovery before everything else fills the day.</p>
            </div>
            <ArrowRight size={15} />
          </Link>
          <Link href="/self/check-in">
            <span className="self-practice-icon career">
              <Brain size={19} />
            </span>
            <div>
              <strong>Reflection</strong>
              <small>{reflections.length} entries</small>
              <p>Notice patterns without turning yourself into a score.</p>
            </div>
            <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <section
        className="self-direction-card"
        aria-labelledby="self-direction-title"
      >
        <header>
          <div>
            <span className="eyebrow">Your direction</span>
            <h2 id="self-direction-title">Growth connected to daily life</h2>
          </div>
        </header>
        <div>
          {direction.map((area, index) => {
            const Icon = [BookOpen, Target, Sparkles][index];
            return (
              <Link href={`/${area.module}`} key={area.module}>
                <span>
                  <Icon size={18} />
                </span>
                <div>
                  <strong>
                    {area.module[0].toUpperCase() + area.module.slice(1)}
                  </strong>
                  <small>{area.open} open</small>
                  <p>{area.next?.title ?? "No current action"}</p>
                </div>
                <ArrowRight size={15} />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
