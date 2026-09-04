"use client";

import {
  AtSign,
  ChevronRight,
  Inbox,
  Mail,
  Plus,
  Server,
  Trash2,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import {
  emailProviders,
  emailProviderLabels,
  type EmailAccount,
  type EmailProvider,
  useEmailAccounts,
} from "@/lib/email-accounts";

const providerDetails: Record<
  EmailProvider,
  { description: string; icon: typeof Mail }
> = {
  gmail: {
    description: "Connect a Google mailbox with OAuth.",
    icon: Mail,
  },
  outlook: {
    description: "Microsoft Outlook, Hotmail, or Live accounts.",
    icon: AtSign,
  },
  custom: {
    description: "Use IMAP for an address on your own domain.",
    icon: Server,
  },
};

function ProviderIcon({
  provider,
  size = 17,
}: {
  provider: EmailProvider;
  size?: number;
}) {
  const Icon = providerDetails[provider].icon;
  return <Icon size={size} />;
}

function MailboxSetup({
  account,
  onRemove,
}: {
  account: EmailAccount;
  onRemove: () => void;
}) {
  return (
    <section className="mailbox-panel">
      <div className={`mailbox-provider-mark ${account.provider}`}>
        <ProviderIcon provider={account.provider} size={22} />
      </div>
      <div className="mailbox-panel-copy">
        <span className="kicker">{emailProviderLabels[account.provider]}</span>
        <h2>{account.label}</h2>
        <p>{account.address}</p>
        <span className="mailbox-status">Authorization required</span>
        <p className="mailbox-setup-note">
          This inbox tab is ready. Secure message sync will start after the
          server-side {account.provider === "custom" ? "IMAP" : "OAuth"}{" "}
          connection is configured; your password is never stored in this
          browser.
        </p>
        {account.imapHost && (
          <small>
            Incoming server: {account.imapHost}:{account.imapPort ?? 993}
          </small>
        )}
      </div>
      <button className="button secondary small" type="button" disabled>
        Finish connection <ChevronRight size={15} />
      </button>
      <button
        className="icon-button mailbox-remove"
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${account.address}`}
      >
        <Trash2 size={16} />
      </button>
    </section>
  );
}

export function EmailInbox({
  ownerId,
  captureCount,
  children,
}: {
  ownerId: string;
  captureCount: number;
  children: ReactNode;
}) {
  const { accounts, add, remove } = useEmailAccounts(ownerId);
  const [active, setActive] = useState("capture");
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<EmailProvider>("gmail");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");

  const selected = accounts.find((account) => account.id === active);
  const visibleActive = active === "capture" || selected ? active : "capture";

  const chooseProvider = (next: EmailProvider) => {
    setProvider(next);
    if (next !== "custom") setImapHost("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = add({
      provider,
      address,
      label: label.trim() || emailProviderLabels[provider],
      ...(provider === "custom" && imapHost.trim()
        ? {
            imapHost: imapHost.trim().toLowerCase(),
            imapPort: Number(imapPort) || 993,
          }
        : {}),
    });
    setActive(account.id);
    setAdding(false);
    setAddress("");
    setLabel("");
    setImapHost("");
    setImapPort("993");
  };

  return (
    <>
      <div className="inbox-account-bar">
        <nav className="inbox-account-tabs" aria-label="Inboxes">
          <button
            type="button"
            className={visibleActive === "capture" ? "active" : ""}
            onClick={() => setActive("capture")}
          >
            <Inbox size={16} />
            <span>Capture</span>
            <small>{captureCount}</small>
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
              <span
                className="mailbox-tab-status"
                aria-label="Authorization required"
              />
            </button>
          ))}
        </nav>
        <button
          className="button primary small inbox-connect-button"
          type="button"
          onClick={() => setAdding((current) => !current)}
          aria-expanded={adding}
        >
          <Plus size={16} /> Connect email
        </button>
      </div>

      {adding && (
        <section
          className="mailbox-connect"
          aria-label="Connect an email inbox"
        >
          <div className="mailbox-connect-heading">
            <div>
              <span className="eyebrow">Add another inbox</span>
              <h2>Choose your email provider</h2>
              <p>
                Add the mailbox now. Secure authorization is completed on the
                server, never by saving a password in this browser.
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
          <div className="mailbox-provider-grid">
            {emailProviders.map((item) => {
              const detail = providerDetails[item];
              return (
                <button
                  type="button"
                  key={item}
                  className={provider === item ? "active" : ""}
                  onClick={() => chooseProvider(item)}
                >
                  <span className={`mailbox-provider-mark ${item}`}>
                    <ProviderIcon provider={item} size={20} />
                  </span>
                  <strong>{emailProviderLabels[item]}</strong>
                  <small>{detail.description}</small>
                </button>
              );
            })}
          </div>
          <form className="mailbox-connect-form" onSubmit={submit}>
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                required
                placeholder={
                  provider === "gmail"
                    ? "you@gmail.com"
                    : provider === "outlook"
                      ? "you@outlook.com"
                      : "you@yourdomain.com"
                }
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </label>
            <label>
              Tab name
              <input
                type="text"
                maxLength={80}
                placeholder="Personal, Work, Family…"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
            {provider === "custom" && (
              <>
                <label>
                  IMAP server
                  <input
                    type="text"
                    required
                    placeholder="imap.yourdomain.com"
                    value={imapHost}
                    onChange={(event) => setImapHost(event.target.value)}
                  />
                </label>
                <label className="mailbox-port-field">
                  Port
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    required
                    value={imapPort}
                    onChange={(event) => setImapPort(event.target.value)}
                  />
                </label>
              </>
            )}
            <button className="button primary" type="submit">
              Add inbox tab <ChevronRight size={16} />
            </button>
          </form>
        </section>
      )}

      {visibleActive === "capture" ? (
        children
      ) : selected ? (
        <MailboxSetup account={selected} onRemove={() => remove(selected.id)} />
      ) : null}
    </>
  );
}
