"use client";

import {
  CalendarDays,
  Check,
  ChevronRight,
  Cloud,
  Edit3,
  LoaderCircle,
  MapPin,
  PanelsTopLeft,
  Plus,
  RefreshCw,
  Server,
  Smartphone,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/components/auth-provider";
import {
  calendarProviderLabels,
  calendarProviders,
  type CalendarAccount,
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarProvider,
  type CalendarSyncMode,
  useCalendarAccounts,
  useCalendarEvents,
} from "@/lib/calendar-accounts";

const providerDetails: Record<
  CalendarProvider,
  { description: string; icon: typeof CalendarDays; placeholder: string }
> = {
  google: {
    description: "Google Calendar and Google Workspace.",
    icon: CalendarDays,
    placeholder: "you@gmail.com (optional)",
  },
  microsoft: {
    description: "Microsoft 365, Outlook, Hotmail, or Live.",
    icon: PanelsTopLeft,
    placeholder: "you@outlook.com (optional)",
  },
  apple: {
    description: "iCloud calendars with an app-specific password.",
    icon: Smartphone,
    placeholder: "you@icloud.com",
  },
  caldav: {
    description: "A custom-domain or self-hosted CalDAV account.",
    icon: Server,
    placeholder: "you@example.com",
  },
};

function ProviderIcon({ provider }: { provider: CalendarProvider }) {
  const Icon = providerDetails[provider].icon;
  return <Icon size={17} />;
}

function localDateTime(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}

function defaultTimes() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    start: localDateTime(start.toISOString()),
    end: localDateTime(end.toISOString()),
  };
}

function toIso(value: string, allDay: boolean) {
  return allDay
    ? new Date(`${value}T00:00:00Z`).toISOString()
    : new Date(value).toISOString();
}

function EventEditor({
  accounts,
  event,
  initialAccountId,
  onSave,
  onClose,
}: {
  accounts: CalendarAccount[];
  event?: CalendarEvent;
  initialAccountId?: string;
  onSave: (input: CalendarEventInput) => Promise<void>;
  onClose: () => void;
}) {
  const writableSources = accounts.flatMap((account) =>
    account.syncMode === "two-way"
      ? account.sources
          .filter((source) => source.selected && source.canWrite)
          .map((source) => ({ source, account }))
      : [],
  );
  const preferred =
    writableSources.find(({ source }) => source.id === event?.sourceId) ||
    writableSources.find(({ account }) => account.id === initialAccountId) ||
    writableSources[0];
  const initial = defaultTimes();
  const [sourceId, setSourceId] = useState(preferred?.source.id || "");
  const [title, setTitle] = useState(event?.title || "");
  const [description, setDescription] = useState(event?.description || "");
  const [location, setLocation] = useState(event?.location || "");
  const [allDay, setAllDay] = useState(event?.allDay || false);
  const [startsAt, setStartsAt] = useState(
    event
      ? event.allDay
        ? event.startsAt.slice(0, 10)
        : localDateTime(event.startsAt)
      : initial.start,
  );
  const [endsAt, setEndsAt] = useState(
    event
      ? event.allDay
        ? event.endsAt.slice(0, 10)
        : localDateTime(event.endsAt)
      : initial.end,
  );
  const [attendees, setAttendees] = useState(
    event?.attendees
      .map((person) => person.address)
      .filter(Boolean)
      .join(", ") || "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setAllDayMode = (next: boolean) => {
    setAllDay(next);
    if (next) {
      setStartsAt(startsAt.slice(0, 10));
      const endDate = new Date(`${startsAt.slice(0, 10)}T00:00:00Z`);
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      setEndsAt(endDate.toISOString().slice(0, 10));
    } else {
      const nextTimes = defaultTimes();
      setStartsAt(nextTimes.start);
      setEndsAt(nextTimes.end);
    }
  };

  const submit = async (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({
        sourceId,
        title,
        description,
        location,
        startsAt: toIso(startsAt, allDay),
        endsAt: toIso(endsAt, allDay),
        allDay,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        attendees: attendees
          .split(/[;,]/)
          .map((address) => address.trim().toLowerCase())
          .filter(Boolean)
          .map((address) => ({ address })),
      });
      onClose();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Event could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="calendar-event-editor"
      aria-label={event ? "Edit event" : "New event"}
    >
      <div className="calendar-editor-heading">
        <div>
          <span className="kicker">
            {event ? "Update provider event" : "New provider event"}
          </span>
          <h2>{event ? "Edit event" : "Add to calendar"}</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Close event form"
        >
          <X size={17} />
        </button>
      </div>
      {writableSources.length ? (
        <form
          className="calendar-event-form"
          onSubmit={(formEvent) => void submit(formEvent)}
        >
          <label>
            Calendar
            <select
              value={sourceId}
              disabled={Boolean(event)}
              onChange={(change) => setSourceId(change.target.value)}
            >
              {writableSources.map(({ source, account }) => (
                <option value={source.id} key={source.id}>
                  {account.label} · {source.name}
                </option>
              ))}
            </select>
          </label>
          <label className="calendar-event-title">
            Title
            <input
              value={title}
              onChange={(change) => setTitle(change.target.value)}
              maxLength={500}
              required
              autoFocus
            />
          </label>
          <label className="calendar-all-day-toggle">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(change) => setAllDayMode(change.target.checked)}
            />
            All day
          </label>
          <label>
            Starts
            <input
              type={allDay ? "date" : "datetime-local"}
              value={startsAt}
              onChange={(change) => setStartsAt(change.target.value)}
              required
            />
          </label>
          <label>
            Ends
            <input
              type={allDay ? "date" : "datetime-local"}
              value={endsAt}
              onChange={(change) => setEndsAt(change.target.value)}
              required
            />
          </label>
          <label>
            Location
            <input
              value={location}
              onChange={(change) => setLocation(change.target.value)}
              maxLength={1000}
              placeholder="Optional"
            />
          </label>
          <label>
            Attendees
            <input
              value={attendees}
              onChange={(change) => setAttendees(change.target.value)}
              placeholder="Emails, separated by commas"
            />
          </label>
          <label className="calendar-event-description">
            Notes
            <textarea
              value={description}
              onChange={(change) => setDescription(change.target.value)}
              maxLength={20000}
              rows={3}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary"
            type="submit"
            disabled={saving || !sourceId}
          >
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            {saving ? "Saving…" : event ? "Save changes" : "Create event"}
          </button>
        </form>
      ) : (
        <p className="muted">
          Connect a writable calendar and select at least one source before
          adding events.
        </p>
      )}
    </section>
  );
}

function EventList({
  events,
  accounts,
  title,
  empty,
  onEdit,
  onDelete,
}: {
  events: CalendarEvent[];
  accounts: CalendarAccount[];
  title: string;
  empty: string;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => Promise<void>;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
  }, []);
  const upcoming = events
    .filter((event) => !now || new Date(event.endsAt).valueOf() >= now)
    .slice(0, 50);
  return (
    <section className="list-surface calendar-provider-events">
      <div className="calendar-list-heading">
        <div>
          <span className="kicker">Synchronized schedule</span>
          <h2>{title}</h2>
        </div>
        <span>{upcoming.length} upcoming</span>
      </div>
      {upcoming.length ? (
        upcoming.map((event) => {
          const account = accounts.find((item) => item.id === event.accountId);
          const editable =
            event.editable &&
            account?.syncMode === "two-way" &&
            account.sources.some(
              (source) => source.id === event.sourceId && source.canWrite,
            ) &&
            !(
              (account.provider === "apple" || account.provider === "caldav") &&
              (event.recurrence.length > 0 ||
                event.providerEventId.includes(":"))
            );
          return (
            <article className="calendar-event-row" key={event.id}>
              <time dateTime={event.startsAt}>
                <strong>
                  {new Intl.DateTimeFormat("en", {
                    day: "numeric",
                    month: "short",
                  }).format(new Date(event.startsAt))}
                </strong>
                <span>
                  {event.allDay
                    ? "All day"
                    : new Intl.DateTimeFormat("en", {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(event.startsAt))}
                </span>
              </time>
              <span
                className="calendar-event-color"
                style={{
                  backgroundColor:
                    account?.sources.find(
                      (source) => source.id === event.sourceId,
                    )?.color || undefined,
                }}
              />
              <div>
                <strong>{event.title}</strong>
                <p>
                  {event.sourceName} · {event.ownerName}
                  {event.location && (
                    <>
                      {" "}
                      · <MapPin size={12} /> {event.location}
                    </>
                  )}
                </p>
              </div>
              {event.sharedWithHousehold && (
                <span className="calendar-shared-badge">
                  <UsersRound size={13} /> Family
                </span>
              )}
              {editable && (
                <div className="calendar-event-actions">
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => onEdit(event)}
                    aria-label={`Edit ${event.title}`}
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="icon-button danger"
                    type="button"
                    onClick={() => void onDelete(event)}
                    aria-label={`Delete ${event.title}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </article>
          );
        })
      ) : (
        <p className="muted">{empty}</p>
      )}
    </section>
  );
}

function CalendarConnection({
  account,
  events,
  onUpdate,
  onUpdateSource,
  onSync,
  onRemove,
  onNewEvent,
  onEditEvent,
  onDeleteEvent,
}: {
  account: CalendarAccount;
  events: CalendarEvent[];
  onUpdate: (
    changes: Partial<
      Pick<
        CalendarAccount,
        "label" | "included" | "syncMode" | "shareWithHousehold"
      >
    >,
  ) => Promise<unknown>;
  onUpdateSource: (sourceId: string, selected: boolean) => Promise<unknown>;
  onSync: () => Promise<unknown>;
  onRemove: () => Promise<void>;
  onNewEvent: () => void;
  onEditEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (event: CalendarEvent) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Calendar update failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="calendar-connection-panel">
        <div className={`calendar-provider-mark ${account.provider}`}>
          <ProviderIcon provider={account.provider} />
        </div>
        <div className="calendar-connection-copy">
          <span className="kicker">
            {calendarProviderLabels[account.provider]}
          </span>
          <h2>{account.label}</h2>
          <p>{account.address}</p>
          <span className={`calendar-auth-status ${account.status}`}>
            {account.status === "active"
              ? "Connected"
              : account.status === "syncing"
                ? "Synchronizing"
                : account.status === "error"
                  ? "Needs attention"
                  : "Connecting"}
          </span>
          <p className="calendar-setup-note">
            {account.lastSyncedAt
              ? `Last synchronized ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(account.lastSyncedAt))}.`
              : "Ready for the first synchronization."}
          </p>
          {(account.lastError || error) && (
            <p className="form-error" role="alert">
              {error || account.lastError}
            </p>
          )}
        </div>
        <div className="calendar-sync-controls">
          <label>
            Sync behavior
            <select
              value={account.syncMode}
              disabled={busy}
              onChange={(change) =>
                void act(() =>
                  onUpdate({
                    syncMode: change.target.value as CalendarSyncMode,
                  }),
                )
              }
            >
              <option value="two-way">Two-way sync</option>
              <option value="read-only">Read only</option>
            </select>
          </label>
          <label className="calendar-inclusion-toggle">
            <input
              type="checkbox"
              checked={account.included}
              disabled={busy}
              onChange={(change) =>
                void act(() => onUpdate({ included: change.target.checked }))
              }
            />
            Include in Jarins Calendar
          </label>
          <label className="calendar-inclusion-toggle">
            <input
              type="checkbox"
              checked={account.shareWithHousehold}
              disabled={busy}
              onChange={(change) =>
                void act(() =>
                  onUpdate({ shareWithHousehold: change.target.checked }),
                )
              }
            />
            Show selected events in Family Calendar
          </label>
          <div className="calendar-connection-actions">
            <button
              className="button primary small"
              type="button"
              disabled={busy || account.status === "syncing"}
              onClick={() => void act(onSync)}
            >
              <RefreshCw
                className={account.status === "syncing" ? "spin" : ""}
                size={15}
              />{" "}
              Sync now
            </button>
            {account.syncMode === "two-way" && (
              <button
                className="button secondary small"
                type="button"
                onClick={onNewEvent}
              >
                <Plus size={15} /> New event
              </button>
            )}
          </div>
        </div>
        <button
          className="icon-button calendar-remove"
          type="button"
          disabled={busy}
          onClick={() => void act(onRemove)}
          aria-label={`Disconnect ${account.label}`}
        >
          <Trash2 size={16} />
        </button>
      </section>
      <section className="calendar-source-picker">
        <div>
          <span className="kicker">Calendars in this account</span>
          <h2>Choose what appears</h2>
        </div>
        <div className="calendar-source-list">
          {account.sources.map((source) => (
            <label key={source.id}>
              <input
                type="checkbox"
                checked={source.selected}
                disabled={busy}
                onChange={(change) =>
                  void act(() =>
                    onUpdateSource(source.id, change.target.checked),
                  )
                }
              />
              <span
                className="calendar-source-dot"
                style={{ backgroundColor: source.color || undefined }}
              />
              <span>
                <strong>{source.name}</strong>
                <small>
                  {source.isPrimary
                    ? "Primary"
                    : source.canWrite
                      ? "Writable"
                      : "Read only"}
                </small>
              </span>
            </label>
          ))}
        </div>
      </section>
      <EventList
        events={events}
        accounts={[account]}
        title={`${account.label} events`}
        empty="No upcoming events have synchronized from this account."
        onEdit={onEditEvent}
        onDelete={onDeleteEvent}
      />
    </>
  );
}

export function CalendarHub({
  ownerId,
  eventCount,
  familyCalendar,
  children,
}: {
  ownerId: string;
  eventCount: number;
  familyCalendar: (events: CalendarEvent[]) => ReactNode;
  children: ReactNode;
}) {
  const { supabase, status } = useAuth();
  const accountState = useCalendarAccounts(ownerId, supabase);
  const eventState = useCalendarEvents(ownerId, supabase);
  const { accounts } = accountState;
  const [active, setActive] = useState("master");
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<CalendarProvider>("google");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [syncMode, setSyncMode] = useState<CalendarSyncMode>("two-way");
  const [included, setIncluded] = useState(true);
  const [shareWithHousehold, setShareWithHousehold] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [eventEditor, setEventEditor] = useState<{
    event?: CalendarEvent;
    accountId?: string;
  } | null>(null);
  const autoSynced = useRef(false);

  const selected = accounts.find((account) => account.id === active);
  const visibleActive =
    active === "master" || active === "family" || selected ? active : "master";
  const includedAccounts = accounts.filter((account) => account.included);
  const includedIds = new Set(includedAccounts.map((account) => account.id));
  const selectedSourceIds = new Set(
    includedAccounts.flatMap((account) =>
      account.sources
        .filter((source) => source.selected)
        .map((source) => source.id),
    ),
  );
  const ownMasterEvents = eventState.events.filter(
    (event) =>
      event.ownerUserId === ownerId &&
      includedIds.has(event.accountId) &&
      selectedSourceIds.has(event.sourceId),
  );
  const familyEvents = eventState.events.filter(
    (event) => event.sharedWithHousehold,
  );

  useEffect(() => {
    if (autoSynced.current || !accounts.length || typeof window === "undefined")
      return;
    autoSynced.current = true;
    queueMicrotask(() => {
      const query = new URLSearchParams(window.location.search);
      const justConnected = query.get("calendar") === "connected";
      const staleBefore = Date.now() - 15 * 60 * 1000;
      const targets = justConnected
        ? [accounts.find((item) => !item.lastSyncedAt) || accounts[0]]
        : accounts.filter(
            (account) =>
              account.status !== "syncing" &&
              (!account.lastSyncedAt ||
                new Date(account.lastSyncedAt).valueOf() < staleBefore),
          );
      if (justConnected) {
        setActive(targets[0].id);
        window.history.replaceState({}, "", window.location.pathname);
      }
      void targets
        .reduce(
          (previous, account) =>
            previous
              .then(() => accountState.sync(account.id))
              .then(() => undefined),
          Promise.resolve(),
        )
        .then(() => eventState.load())
        .catch(() => undefined);
    });
  }, [accountState, accounts, eventState]);

  const resetConnectionForm = () => {
    setAddress("");
    setLabel("");
    setUsername("");
    setPassword("");
    setServerUrl("");
    setSyncMode("two-way");
    setIncluded(true);
    setShareWithHousehold(false);
    setFormError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    const name = label.trim() || calendarProviderLabels[provider];
    try {
      if (provider === "google" || provider === "microsoft") {
        await accountState.startOAuth(provider, {
          label: name,
          expectedAddress: address,
          syncMode,
          included,
          shareWithHousehold,
        });
        return;
      }
      const account = await accountState.connectCalDav({
        provider,
        address,
        label: name,
        username,
        password,
        serverUrl,
        syncMode,
        included,
        shareWithHousehold,
      });
      autoSynced.current = true;
      setActive(account.id);
      setAdding(false);
      resetConnectionForm();
      await accountState.sync(account.id);
      await eventState.load();
    } catch (nextError) {
      setFormError(
        nextError instanceof Error
          ? nextError.message
          : "Calendar could not connect.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const saveEvent = async (input: CalendarEventInput) => {
    if (eventEditor?.event)
      await eventState.update(eventEditor.event.id, input);
    else await eventState.create(input);
  };

  const deleteEvent = async (calendarEvent: CalendarEvent) => {
    if (
      !window.confirm(
        `Delete “${calendarEvent.title}” from its provider calendar?`,
      )
    )
      return;
    await eventState.remove(calendarEvent.id);
  };

  return (
    <>
      <section className="calendar-master-card">
        <span className="calendar-master-icon">
          <Cloud size={21} />
        </span>
        <div>
          <span className="kicker">System calendar · always first</span>
          <h2>Jarins Calendar</h2>
          <p>
            Your master view combines Jarins events with every included external
            calendar.
          </p>
        </div>
        <div className="calendar-master-stats">
          <span>
            <strong>{eventCount + ownMasterEvents.length}</strong> upcoming
          </span>
          <span>
            <strong>{includedAccounts.length}</strong> accounts
          </span>
        </div>
      </section>

      <div className="calendar-account-bar">
        <nav className="calendar-account-tabs" aria-label="Calendars">
          <button
            type="button"
            className={visibleActive === "master" ? "active master" : "master"}
            onClick={() => setActive("master")}
          >
            <CalendarDays size={16} />
            <span>Jarins Calendar</span>
            <small>All</small>
          </button>
          <button
            type="button"
            className={visibleActive === "family" ? "active family" : "family"}
            onClick={() => setActive("family")}
          >
            <UsersRound size={16} />
            <span>Family calendar</span>
            <small>People</small>
          </button>
          {accounts.map((account) => (
            <button
              type="button"
              key={account.id}
              className={visibleActive === account.id ? "active" : ""}
              onClick={() => setActive(account.id)}
              title={account.address}
            >
              <ProviderIcon provider={account.provider} />
              <span>{account.label}</span>
              {account.status === "syncing" ? (
                <LoaderCircle className="spin" size={13} />
              ) : account.included ? (
                <Check size={13} />
              ) : null}
            </button>
          ))}
        </nav>
        <div className="calendar-bar-actions">
          {accounts.some(
            (account) =>
              account.syncMode === "two-way" &&
              account.sources.some(
                (source) => source.selected && source.canWrite,
              ),
          ) && (
            <button
              className="button secondary small"
              type="button"
              onClick={() => setEventEditor({ accountId: selected?.id })}
            >
              <Plus size={16} /> New event
            </button>
          )}
          <button
            className="button primary small calendar-connect-button"
            type="button"
            onClick={() => setAdding((current) => !current)}
            aria-expanded={adding}
          >
            <Plus size={16} /> Connect calendar
          </button>
        </div>
      </div>

      {(accountState.error || eventState.error) && (
        <p className="calendar-global-error form-error" role="alert">
          {accountState.error || eventState.error}
        </p>
      )}
      {status === "demo" && (
        <section className="calendar-connect">
          <h2>Account connection required</h2>
          <p>
            External calendar synchronization needs a signed-in Jarins account
            and Supabase. Local demo mode cannot safely store provider tokens.
          </p>
        </section>
      )}

      {adding && (
        <section className="calendar-connect" aria-label="Connect a calendar">
          <div className="calendar-connect-heading">
            <div>
              <span className="eyebrow">Bring every schedule together</span>
              <h2>Choose a calendar provider</h2>
              <p>
                Authorize once, choose the calendars you want, and manage events
                from Jarins.
              </p>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
          <div className="calendar-provider-grid">
            {calendarProviders.map((item) => (
              <button
                type="button"
                key={item}
                className={provider === item ? "active" : ""}
                onClick={() => {
                  setProvider(item);
                  if (item === "apple")
                    setServerUrl("https://caldav.icloud.com/");
                  else if (serverUrl === "https://caldav.icloud.com/")
                    setServerUrl("");
                }}
                disabled={
                  accountState.configuration
                    ? !accountState.configuration[item]
                    : false
                }
              >
                <span className={`calendar-provider-mark ${item}`}>
                  <ProviderIcon provider={item} />
                </span>
                <strong>{calendarProviderLabels[item]}</strong>
                <small>{providerDetails[item].description}</small>
              </button>
            ))}
          </div>
          <form
            className="calendar-connect-form"
            onSubmit={(formEvent) => void submit(formEvent)}
          >
            <label>
              Account email
              <input
                type="email"
                required={provider === "apple" || provider === "caldav"}
                maxLength={320}
                placeholder={providerDetails[provider].placeholder}
                value={address}
                onChange={(change) => setAddress(change.target.value)}
              />
            </label>
            <label>
              Calendar tab name
              <input
                type="text"
                maxLength={80}
                placeholder="Personal, Work, Family…"
                value={label}
                onChange={(change) => setLabel(change.target.value)}
              />
            </label>
            {(provider === "apple" || provider === "caldav") && (
              <>
                <label>
                  CalDAV server URL
                  <input
                    type="url"
                    required
                    placeholder="https://calendar.example.com/"
                    value={serverUrl}
                    onChange={(change) => setServerUrl(change.target.value)}
                  />
                </label>
                <label>
                  Username
                  <input
                    required
                    maxLength={320}
                    autoComplete="username"
                    value={username}
                    onChange={(change) => setUsername(change.target.value)}
                  />
                </label>
                <label>
                  {provider === "apple"
                    ? "App-specific password"
                    : "Password / app password"}
                  <input
                    type="password"
                    required
                    maxLength={500}
                    autoComplete="current-password"
                    value={password}
                    onChange={(change) => setPassword(change.target.value)}
                  />
                </label>
              </>
            )}
            <label>
              Sync behavior
              <select
                value={syncMode}
                onChange={(change) =>
                  setSyncMode(change.target.value as CalendarSyncMode)
                }
              >
                <option value="two-way">Two-way sync</option>
                <option value="read-only">Read only</option>
              </select>
            </label>
            <label className="calendar-inclusion-toggle">
              <input
                type="checkbox"
                checked={included}
                onChange={(change) => setIncluded(change.target.checked)}
              />{" "}
              Include in Jarins Calendar
            </label>
            <label className="calendar-inclusion-toggle">
              <input
                type="checkbox"
                checked={shareWithHousehold}
                onChange={(change) =>
                  setShareWithHousehold(change.target.checked)
                }
              />{" "}
              Share selected events with household
            </label>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            {accountState.configuration &&
              !accountState.configuration[provider] && (
                <p className="form-error" role="status">
                  This provider needs its server-side integration secrets before
                  it can be connected.
                </p>
              )}
            <button
              className="button primary"
              type="submit"
              disabled={
                submitting ||
                status === "demo" ||
                Boolean(
                  accountState.configuration &&
                  !accountState.configuration[provider],
                )
              }
            >
              {submitting ? <LoaderCircle className="spin" size={16} /> : null}
              {submitting
                ? "Connecting…"
                : provider === "google" || provider === "microsoft"
                  ? "Continue to provider"
                  : "Verify and connect"}
              <ChevronRight size={16} />
            </button>
          </form>
          <p className="calendar-security-note">
            OAuth tokens and CalDAV passwords are encrypted server-side and
            never stored in this browser. Apple requires an app-specific
            password.
          </p>
        </section>
      )}

      {eventEditor && (
        <EventEditor
          accounts={accounts}
          event={eventEditor.event}
          initialAccountId={eventEditor.accountId}
          onSave={saveEvent}
          onClose={() => setEventEditor(null)}
        />
      )}

      {visibleActive === "master" ? (
        <>
          {children}
          <EventList
            events={ownMasterEvents}
            accounts={accounts}
            title="External calendar events"
            empty={
              accountState.loading || eventState.loading
                ? "Loading connected calendars…"
                : "Connect a calendar to bring external events into this master view."
            }
            onEdit={(event) => setEventEditor({ event })}
            onDelete={deleteEvent}
          />
        </>
      ) : visibleActive === "family" ? (
        familyCalendar(familyEvents)
      ) : selected ? (
        <CalendarConnection
          account={selected}
          events={eventState.events.filter(
            (event) =>
              event.accountId === selected.id &&
              selected.sources.some(
                (source) => source.id === event.sourceId && source.selected,
              ),
          )}
          onUpdate={(changes) => accountState.update(selected.id, changes)}
          onUpdateSource={(sourceId, sourceSelected) =>
            accountState.updateSource(selected.id, sourceId, sourceSelected)
          }
          onSync={async () => {
            await accountState.sync(selected.id);
            await eventState.load();
          }}
          onRemove={async () => {
            await accountState.remove(selected.id);
            setActive("master");
          }}
          onNewEvent={() => setEventEditor({ accountId: selected.id })}
          onEditEvent={(event) => setEventEditor({ event })}
          onDeleteEvent={deleteEvent}
        />
      ) : null}
    </>
  );
}
