"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FolderKey,
  Inbox,
  Mail,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Zap,
} from "lucide-react";
import { useMemo } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  useCalendarAccounts,
  useCalendarEvents,
} from "@/lib/calendar-accounts";
import { useEmailAccounts } from "@/lib/email-accounts";
import { useHouseholdMembers } from "@/lib/household-members";
import type { LifeRecord } from "@/lib/jarins-store";
import { primaryModules } from "@/lib/modules";
import { useStorageAccounts, useStorageItems } from "@/lib/storage-accounts";
import { useClientNow } from "@/lib/use-client-now";

type Props = {
  records: LifeRecord[];
  loading: boolean;
  update: (id: string, changes: Partial<LifeRecord>) => Promise<void>;
};

const homeTools = [
  ["/home/meals", "Meals", "Plan what to cook"],
  ["/home/groceries", "Groceries", "Keep the next shop ready"],
  ["/home/routines", "Routines", "Run recurring home rhythms"],
  ["/home/maintenance", "Maintenance", "Catch repairs before they grow"],
] as const;

function dateKey(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function readableDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value.includes("T") ? value : `${value}T12:00:00`));
}

function urgency(record: LifeRecord, today: string) {
  if (record.date && record.date < today) return 0;
  if (record.essential) return 1;
  if (record.date === today) return 2;
  if (record.date) return 3;
  return 4;
}

export function HomeDashboard({ records, loading, update }: Props) {
  const now = useClientNow();
  const { supabase, user, householdId, status } = useAuth();
  const ownerId = user?.id ?? "local";
  const email = useEmailAccounts(ownerId, supabase);
  const calendarAccounts = useCalendarAccounts(ownerId, supabase);
  const calendar = useCalendarEvents(ownerId, supabase);
  const storage = useStorageAccounts(ownerId, supabase);
  const vault = useStorageItems(ownerId, supabase, {
    kind: "all",
    enabled: storage.accounts.some((account) => account.status === "active"),
  });
  const household = useHouseholdMembers({
    supabase,
    userId: user?.id,
    householdId,
  });
  const today = now ? dateKey(now) : "";
  const nextWeekKey = now
    ? dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7))
    : "";
  const openRecords = useMemo(
    () => records.filter((record) => record.status !== "done"),
    [records],
  );
  const priorityQueue = useMemo(
    () =>
      [...openRecords]
        .sort((a, b) => {
          const difference = urgency(a, today) - urgency(b, today);
          return (
            difference || (a.date ?? "9999").localeCompare(b.date ?? "9999")
          );
        })
        .slice(0, 6),
    [openRecords, today],
  );
  const dueNow = openRecords.filter(
    (record) => record.date && record.date <= today,
  ).length;
  const nextSevenDays = openRecords.filter(
    (record) =>
      record.date && record.date >= today && record.date <= nextWeekKey,
  ).length;
  const essentials = openRecords.filter((record) => record.essential).length;
  const unreadEmail = email.accounts.reduce(
    (total, account) => total + account.unreadCount,
    0,
  );
  const upcomingEvents = calendar.events
    .filter((event) => Boolean(now) && event.endsAt >= now!.toISOString())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 5);
  const modules = primaryModules
    .filter((module) => module.key !== "today")
    .map((module) => {
      const moduleRecords = records.filter(
        (record) => record.module === module.key,
      );
      const open = moduleRecords.filter((record) => record.status !== "done");
      const next = [...open]
        .filter((record) => record.date || record.essential)
        .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"))[0];
      return {
        ...module,
        total: moduleRecords.length,
        open: open.length,
        next,
      };
    });
  const connectionIssues = [
    email.error,
    calendarAccounts.error || calendar.error,
    storage.error || vault.error,
    household.error,
  ].filter(Boolean).length;

  return (
    <div className="home-command-dashboard">
      <section className="home-command-hero">
        <div>
          <span className="eyebrow light">Whole system · one view</span>
          <h2>Everything that needs you, without the hunt.</h2>
          <p>
            Act on priorities and see whether your family, calendar, inbox, and
            files are connected.
          </p>
        </div>
        <div className="home-command-pulse">
          <span className={connectionIssues ? "attention" : "ready"}>
            {connectionIssues ? (
              <CircleAlert size={16} />
            ) : (
              <ShieldCheck size={16} />
            )}
            {status === "demo"
              ? "Local mode"
              : connectionIssues
                ? `${connectionIssues} connections need attention`
                : "Account services ready"}
          </span>
          <strong>{loading ? "—" : openRecords.length}</strong>
          <small>open items across Jarins</small>
        </div>
      </section>

      <section className="home-command-actions" aria-label="System actions">
        <button
          type="button"
          className="primary"
          onClick={() => window.dispatchEvent(new Event("jarins-open-capture"))}
        >
          <span>
            <Plus size={18} />
          </span>
          <strong>Quick capture</strong>
          <small>Task, note, or reminder</small>
        </button>
        <Link href="/inbox">
          <span>
            <Inbox size={18} />
          </span>
          <strong>Inbox</strong>
          <small>
            {unreadEmail
              ? `${unreadEmail} unread emails`
              : "Review incoming items"}
          </small>
        </Link>
        <Link href="/calendar">
          <span>
            <CalendarDays size={18} />
          </span>
          <strong>Calendar</strong>
          <small>
            {upcomingEvents.length
              ? `${upcomingEvents.length} events ahead`
              : "Plan and coordinate"}
          </small>
        </Link>
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new Event("jarins-open-messages"))
          }
        >
          <span>
            <MessageCircle size={18} />
          </span>
          <strong>Messages</strong>
          <small>People, teams, and threads</small>
        </button>
        <Link href="/vault">
          <span>
            <FolderKey size={18} />
          </span>
          <strong>VAULT</strong>
          <small>
            {vault.items.length
              ? `${vault.items.length} files in view`
              : "Find connected files"}
          </small>
        </Link>
        <Link href="/search">
          <span>
            <Search size={18} />
          </span>
          <strong>Search</strong>
          <small>Find anything in the system</small>
        </Link>
      </section>

      <section className="status-tiles" aria-label="System status">
        <article>
          <span className="status-tile-icon urgent">
            <CircleAlert size={17} />
          </span>
          <div>
            <strong>{loading ? "—" : dueNow}</strong>
            <small>Due or overdue</small>
          </div>
        </article>
        <article>
          <span className="status-tile-icon calendar">
            <Clock3 size={17} />
          </span>
          <div>
            <strong>{loading ? "—" : nextSevenDays}</strong>
            <small>Next seven days</small>
          </div>
        </article>
        <article>
          <span className="status-tile-icon focus">
            <Sparkles size={17} />
          </span>
          <div>
            <strong>{loading ? "—" : essentials}</strong>
            <small>Current essentials</small>
          </div>
        </article>
        <article>
          <span className="status-tile-icon family">
            <UsersRound size={17} />
          </span>
          <div>
            <strong>
              {household.loading ? "—" : household.members.length}
            </strong>
            <small>Family accounts</small>
          </div>
        </article>
      </section>

      <div className="home-command-grid">
        <section
          className="home-dashboard-card priority"
          aria-labelledby="home-priority-title"
        >
          <header>
            <div>
              <span className="eyebrow">Action queue</span>
              <h2 id="home-priority-title">What needs attention</h2>
            </div>
            <Link href="/today" className="text-button">
              Open Today <ChevronRight size={14} />
            </Link>
          </header>
          {loading ? (
            <p className="home-dashboard-empty">Loading your priorities…</p>
          ) : priorityQueue.length ? (
            <div className="home-priority-list">
              {priorityQueue.map((record) => (
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
                  <Link href={`/${record.module}`}>
                    <strong>{record.title}</strong>
                    <small>
                      {record.kind} · {record.module}
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
                        : readableDate(record.date)
                      : record.essential
                        ? "Essential"
                        : "Open"}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <div className="home-dashboard-empty">
              <Check size={19} />
              <strong>Nothing needs attention</strong>
              <p>Use Quick capture when something new arrives.</p>
            </div>
          )}
        </section>

        <section
          className="home-dashboard-card agenda"
          aria-labelledby="home-agenda-title"
        >
          <header>
            <div>
              <span className="eyebrow">Connected schedule</span>
              <h2 id="home-agenda-title">Coming up</h2>
            </div>
            <Link href="/calendar" className="text-button">
              Calendar <ChevronRight size={14} />
            </Link>
          </header>
          {upcomingEvents.length ? (
            <div className="home-agenda-list">
              {upcomingEvents.map((event) => (
                <Link href="/calendar" key={event.id}>
                  <time>{readableDate(event.startsAt)}</time>
                  <span>
                    <strong>{event.title}</strong>
                    <small>
                      {event.ownerName} · {event.sourceName}
                    </small>
                  </span>
                  <ChevronRight size={14} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="home-dashboard-empty">
              <CalendarDays size={19} />
              <strong>Your connected calendar is clear</strong>
              <p>Dated Jarins items still appear in the action queue.</p>
            </div>
          )}
          <Link href="/reset/weekly" className="home-guided-action">
            <Zap size={15} /> Run the weekly reset <ArrowRight size={14} />
          </Link>
        </section>
      </div>

      <section
        className="home-area-overview"
        aria-labelledby="home-areas-title"
      >
        <header>
          <div>
            <span className="eyebrow">Every part of life</span>
            <h2 id="home-areas-title">System overview</h2>
          </div>
          <span>{records.length} total items</span>
        </header>
        <div className="home-area-grid">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Link
                href={module.href}
                key={module.key}
                className={`area-${module.key}`}
              >
                <span className="home-area-icon">
                  <Icon size={18} />
                </span>
                <div>
                  <strong>{module.label}</strong>
                  <small>
                    {module.open} open · {module.total} total
                  </small>
                  <p>{module.next?.title ?? module.description}</p>
                </div>
                <ChevronRight size={15} />
              </Link>
            );
          })}
        </div>
      </section>

      <div className="home-lower-grid">
        <section
          className="home-dashboard-card home-tools"
          aria-labelledby="home-tools-title"
        >
          <header>
            <div>
              <span className="eyebrow">Household operations</span>
              <h2 id="home-tools-title">Run the home</h2>
            </div>
          </header>
          <div>
            {homeTools.map(([href, label, detail]) => (
              <Link href={href} key={href}>
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
                <ArrowRight size={15} />
              </Link>
            ))}
          </div>
        </section>
        <section
          className="home-dashboard-card connections"
          aria-labelledby="connections-title"
        >
          <header>
            <div>
              <span className="eyebrow">Account connections</span>
              <h2 id="connections-title">Services</h2>
            </div>
          </header>
          <div className="home-connection-list">
            <Link href="/inbox">
              <Mail size={17} />
              <span>
                <strong>Email</strong>
                <small>
                  {email.accounts.length} inboxes · {unreadEmail} unread
                </small>
              </span>
              <b className={email.error ? "error" : ""}>
                {email.error
                  ? "Check"
                  : email.accounts.length
                    ? "Ready"
                    : "Connect"}
              </b>
            </Link>
            <Link href="/calendar">
              <CalendarDays size={17} />
              <span>
                <strong>Calendars</strong>
                <small>
                  {calendarAccounts.accounts.length} connected ·{" "}
                  {calendar.events.length} events
                </small>
              </span>
              <b
                className={
                  calendarAccounts.error || calendar.error ? "error" : ""
                }
              >
                {calendarAccounts.error || calendar.error
                  ? "Check"
                  : calendarAccounts.accounts.length
                    ? "Ready"
                    : "Connect"}
              </b>
            </Link>
            <Link href="/vault">
              <FolderKey size={17} />
              <span>
                <strong>Storage</strong>
                <small>
                  {storage.accounts.length} drives ·{" "}
                  {storage.accounts.reduce(
                    (sum, account) => sum + account.itemCount,
                    0,
                  )}{" "}
                  indexed
                </small>
              </span>
              <b className={storage.error || vault.error ? "error" : ""}>
                {storage.error || vault.error
                  ? "Check"
                  : storage.accounts.length
                    ? "Ready"
                    : "Connect"}
              </b>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
