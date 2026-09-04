"use client";

import {
  CalendarDays,
  Check,
  ChevronRight,
  Cloud,
  PanelsTopLeft,
  Plus,
  Server,
  Smartphone,
  Trash2,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import {
  calendarProviderLabels,
  calendarProviders,
  type CalendarAccount,
  type CalendarProvider,
  type CalendarSyncMode,
  useCalendarAccounts,
} from "@/lib/calendar-accounts";

const providerDetails: Record<
  CalendarProvider,
  { description: string; icon: typeof CalendarDays; placeholder: string }
> = {
  google: {
    description: "Google Calendar accounts and shared calendars.",
    icon: CalendarDays,
    placeholder: "you@gmail.com",
  },
  microsoft: {
    description: "Microsoft 365, Outlook, Hotmail, or Live.",
    icon: PanelsTopLeft,
    placeholder: "you@outlook.com",
  },
  apple: {
    description: "iCloud calendars through secure CalDAV access.",
    icon: Smartphone,
    placeholder: "you@icloud.com",
  },
  caldav: {
    description: "A custom-domain or self-hosted CalDAV calendar.",
    icon: Server,
    placeholder: "calendar.example.com or you@example.com",
  },
};

function ProviderIcon({ provider }: { provider: CalendarProvider }) {
  const Icon = providerDetails[provider].icon;
  return <Icon size={17} />;
}

function CalendarConnection({
  account,
  onUpdate,
  onRemove,
}: {
  account: CalendarAccount;
  onUpdate: (changes: Pick<CalendarAccount, "included" | "syncMode">) => void;
  onRemove: () => void;
}) {
  return (
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
        <span className="calendar-auth-status">Authorization required</span>
        <p className="calendar-setup-note">
          This calendar is ready to authorize. Events will join Jarins Calendar
          after secure server-side OAuth or CalDAV credentials are configured.
        </p>
      </div>
      <div className="calendar-sync-controls">
        <label>
          Sync behavior
          <select
            value={account.syncMode}
            onChange={(event) =>
              onUpdate({
                included: account.included,
                syncMode: event.target.value as CalendarSyncMode,
              })
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
            onChange={(event) =>
              onUpdate({
                included: event.target.checked,
                syncMode: account.syncMode,
              })
            }
          />
          Include in Jarins Calendar
        </label>
        <button className="button primary small" type="button" disabled>
          Finish authorization <ChevronRight size={15} />
        </button>
      </div>
      <button
        className="icon-button calendar-remove"
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${account.label}`}
      >
        <Trash2 size={16} />
      </button>
    </section>
  );
}

export function CalendarHub({
  ownerId,
  eventCount,
  children,
}: {
  ownerId: string;
  eventCount: number;
  children: ReactNode;
}) {
  const { accounts, add, update, remove } = useCalendarAccounts(ownerId);
  const [active, setActive] = useState("master");
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<CalendarProvider>("google");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [syncMode, setSyncMode] = useState<CalendarSyncMode>("two-way");

  const selected = accounts.find((account) => account.id === active);
  const visibleActive = active === "master" || selected ? active : "master";
  const includedCount = accounts.filter((account) => account.included).length;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = add({
      provider,
      address,
      label: label.trim() || calendarProviderLabels[provider],
      syncMode,
    });
    setActive(account.id);
    setAdding(false);
    setAddress("");
    setLabel("");
    setSyncMode("two-way");
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
            <strong>{eventCount}</strong> upcoming
          </span>
          <span>
            <strong>{includedCount}</strong> sources
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
              {account.included && <Check size={13} />}
            </button>
          ))}
        </nav>
        <button
          className="button primary small calendar-connect-button"
          type="button"
          onClick={() => setAdding((current) => !current)}
          aria-expanded={adding}
        >
          <Plus size={16} /> Connect calendar
        </button>
      </div>

      {adding && (
        <section className="calendar-connect" aria-label="Connect a calendar">
          <div className="calendar-connect-heading">
            <div>
              <span className="eyebrow">Bring every schedule together</span>
              <h2>Choose a calendar provider</h2>
              <p>
                Add the calendar now and finish secure authorization when the
                provider connection is configured.
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
                onClick={() => setProvider(item)}
              >
                <span className={`calendar-provider-mark ${item}`}>
                  <ProviderIcon provider={item} />
                </span>
                <strong>{calendarProviderLabels[item]}</strong>
                <small>{providerDetails[item].description}</small>
              </button>
            ))}
          </div>
          <form className="calendar-connect-form" onSubmit={submit}>
            <label>
              Account or server
              <input
                type={provider === "caldav" ? "text" : "email"}
                required
                maxLength={255}
                placeholder={providerDetails[provider].placeholder}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </label>
            <label>
              Calendar name
              <input
                type="text"
                maxLength={80}
                placeholder="Personal, Work, Family…"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
            <label>
              Sync behavior
              <select
                value={syncMode}
                onChange={(event) =>
                  setSyncMode(event.target.value as CalendarSyncMode)
                }
              >
                <option value="two-way">Two-way sync</option>
                <option value="read-only">Read only</option>
              </select>
            </label>
            <button className="button primary" type="submit">
              Add calendar tab <ChevronRight size={16} />
            </button>
          </form>
          <p className="calendar-security-note">
            Passwords and provider tokens are never stored in this browser.
          </p>
        </section>
      )}

      {visibleActive === "master" ? (
        children
      ) : selected ? (
        <CalendarConnection
          account={selected}
          onUpdate={(changes) => update(selected.id, changes)}
          onRemove={() => {
            remove(selected.id);
            setActive("master");
          }}
        />
      ) : null}
    </>
  );
}
