"use client";

import {
  Archive,
  AtSign,
  ChevronLeft,
  Download,
  Inbox,
  LoaderCircle,
  Mail,
  MailOpen,
  Paperclip,
  Plus,
  RefreshCw,
  Reply,
  Send,
  Server,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/components/auth-provider";
import {
  EmailAccount,
  EmailComposeAttachment,
  EmailMessage,
  EmailMessageDetail,
  EmailProvider,
  parseEmailAddressList,
} from "@/lib/email";
import {
  emailProviderLabels,
  emailProviders,
  type CustomEmailInput,
  type EmailConfiguration,
  useEmailAccounts,
  useEmailMessages,
} from "@/lib/email-accounts";

const providerDetails: Record<
  EmailProvider,
  { description: string; icon: typeof Mail }
> = {
  gmail: {
    description: "Gmail and Google Workspace through secure Google OAuth.",
    icon: Mail,
  },
  outlook: {
    description: "Outlook, Hotmail, Live, and Microsoft 365 through OAuth.",
    icon: AtSign,
  },
  custom: {
    description: "Any custom-domain mailbox using encrypted IMAP and SMTP.",
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

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || "Email request failed.");
  return data;
}

async function attachmentInput(files: FileList | null) {
  if (!files) return [];
  const chosen = Array.from(files);
  const total = chosen.reduce((sum, file) => sum + file.size, 0);
  if (chosen.length > 10 || total > 10 * 1024 * 1024) {
    throw new Error("Choose up to 10 attachments totaling no more than 10 MB.");
  }
  return Promise.all(
    chosen.map(
      (file) =>
        new Promise<EmailComposeAttachment>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () =>
            reject(new Error(`Could not read ${file.name}.`));
          reader.onload = () =>
            resolve({
              name: file.name,
              contentType: file.type || "application/octet-stream",
              contentBase64: String(reader.result).split(",")[1] ?? "",
            });
          reader.readAsDataURL(file);
        }),
    ),
  );
}

function ConnectionForm({
  configuration,
  onOAuth,
  onCustom,
  onCancel,
}: {
  configuration: EmailConfiguration | null;
  onOAuth: (
    provider: Exclude<EmailProvider, "custom">,
    label: string,
    address: string,
  ) => Promise<void>;
  onCustom: (input: CustomEmailInput) => Promise<EmailAccount>;
  onCancel: () => void;
}) {
  const [provider, setProvider] = useState<EmailProvider>("gmail");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("Personal");
  const [username, setUsername] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [password, setPassword] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const configured = configuration?.[provider] ?? false;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (provider === "custom") {
        await onCustom({
          address,
          label,
          username: username || address,
          password,
          imapHost,
          imapPort,
          imapSecure,
          smtpHost,
          smtpPort,
          smtpSecure,
        });
      } else {
        await onOAuth(provider, label, address);
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Connection failed.",
      );
      setBusy(false);
    }
  };

  return (
    <section className="mailbox-connect" aria-label="Connect an email inbox">
      <div className="mailbox-connect-heading">
        <div>
          <span className="eyebrow">Add another inbox</span>
          <h2>Choose your email provider</h2>
          <p>
            Passwords and refresh tokens are encrypted on the server. Mail
            contents stay with the provider until you open a message.
          </p>
        </div>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="mailbox-provider-grid">
        {emailProviders.map((item) => (
          <button
            type="button"
            key={item}
            className={provider === item ? "active" : ""}
            onClick={() => setProvider(item)}
          >
            <span className={`mailbox-provider-mark ${item}`}>
              <ProviderIcon provider={item} size={20} />
            </span>
            <strong>{emailProviderLabels[item]}</strong>
            <small>{providerDetails[item].description}</small>
          </button>
        ))}
      </div>
      <form className="mailbox-connect-form functional" onSubmit={submit}>
        <label>
          Email address
          <input
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              if (!usernameEdited) setUsername(event.target.value);
            }}
          />
        </label>
        <label>
          Tab name
          <input
            type="text"
            maxLength={80}
            required
            placeholder="Personal, Work, Family…"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        {provider === "custom" && (
          <>
            <label>
              Login name
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => {
                  setUsernameEdited(true);
                  setUsername(event.target.value);
                }}
              />
            </label>
            <label>
              App password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              IMAP host
              <input
                type="text"
                required
                placeholder="imap.example.com"
                value={imapHost}
                onChange={(event) => setImapHost(event.target.value)}
              />
            </label>
            <label>
              IMAP port
              <input
                type="number"
                min={1}
                max={65535}
                required
                value={imapPort}
                onChange={(event) => setImapPort(Number(event.target.value))}
              />
            </label>
            <label className="mailbox-check-field">
              <input
                type="checkbox"
                checked={imapSecure}
                onChange={(event) => setImapSecure(event.target.checked)}
              />
              IMAP uses direct TLS
            </label>
            <label>
              SMTP host
              <input
                type="text"
                required
                placeholder="smtp.example.com"
                value={smtpHost}
                onChange={(event) => setSmtpHost(event.target.value)}
              />
            </label>
            <label>
              SMTP port
              <input
                type="number"
                min={1}
                max={65535}
                required
                value={smtpPort}
                onChange={(event) => setSmtpPort(Number(event.target.value))}
              />
            </label>
            <label className="mailbox-check-field">
              <input
                type="checkbox"
                checked={smtpSecure}
                onChange={(event) => setSmtpSecure(event.target.checked)}
              />
              SMTP uses direct TLS (usually port 465)
            </label>
          </>
        )}
        {error && <p className="mailbox-inline-error">{error}</p>}
        {!configured && (
          <p className="mailbox-inline-error">
            This provider still needs its production Worker secrets configured.
          </p>
        )}
        <button
          className="button primary"
          type="submit"
          disabled={busy || !configured}
        >
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <ProviderIcon provider={provider} />
          )}
          {provider === "custom"
            ? "Verify and connect"
            : `Continue with ${emailProviderLabels[provider]}`}
        </button>
      </form>
    </section>
  );
}

function ComposePanel({
  account,
  initialTo,
  initialSubject,
  onClose,
  onSent,
}: {
  account: EmailAccount;
  initialTo?: string;
  initialSubject?: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(initialTo ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<EmailComposeAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const chooseAttachments = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      setAttachments(await attachmentInput(event.target.files));
      setError("");
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Attachments failed.",
      );
    }
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await jsonRequest(`/api/email/accounts/${account.id}/send`, {
        method: "POST",
        body: JSON.stringify({
          to: parseEmailAddressList(to),
          cc: parseEmailAddressList(cc),
          subject,
          text,
          attachments,
        }),
      });
      onSent();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Message was not sent.",
      );
      setBusy(false);
    }
  };

  return (
    <section className="mail-compose" aria-label="Compose email">
      <div className="mail-compose-title">
        <div>
          <span className="kicker">From {account.label}</span>
          <strong>{account.address}</strong>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close composer"
        >
          <X size={17} />
        </button>
      </div>
      <form onSubmit={send}>
        <label>
          To
          <input
            type="text"
            required
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="name@example.com"
          />
        </label>
        <label>
          Cc
          <input
            type="text"
            value={cc}
            onChange={(event) => setCc(event.target.value)}
            placeholder="Optional"
          />
        </label>
        <label>
          Subject
          <input
            type="text"
            maxLength={998}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </label>
        <textarea
          required
          maxLength={500000}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write your message…"
        />
        <div className="mail-compose-footer">
          <label className="button secondary small mail-attachment-picker">
            <Paperclip size={15} /> Attach
            <input type="file" multiple onChange={chooseAttachments} />
          </label>
          {attachments.length > 0 && (
            <small>
              {attachments.length} file{attachments.length === 1 ? "" : "s"} ·
              max 10 MB
            </small>
          )}
          <span />
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Send size={15} />
            )}{" "}
            Send
          </button>
        </div>
        {error && <p className="mailbox-inline-error">{error}</p>}
      </form>
    </section>
  );
}

function Mailbox({
  account,
  ownerId,
  onSync,
  onRemove,
}: {
  account: EmailAccount;
  ownerId: string;
  onSync: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { supabase } = useAuth();
  const { messages, setMessages, loading, error, load } = useEmailMessages(
    account.id,
    ownerId,
    supabase,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmailMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [compose, setCompose] = useState<{
    to?: string;
    subject?: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const autoSynced = useRef<string | null>(null);

  useEffect(() => {
    if (account.status !== "active" || autoSynced.current === account.id)
      return;
    autoSynced.current = account.id;
    void onSync()
      .then(load)
      .catch(() => undefined);
  }, [account.id, account.status, load, onSync]);

  const openMessage = async (message: EmailMessage) => {
    setSelectedId(message.providerMessageId);
    setDetailLoading(true);
    setNotice("");
    try {
      const data = await jsonRequest<{ message: EmailMessageDetail }>(
        `/api/email/accounts/${account.id}/messages/${encodeURIComponent(message.providerMessageId)}`,
      );
      if (!message.isRead) {
        await jsonRequest(
          `/api/email/accounts/${account.id}/messages/${encodeURIComponent(message.providerMessageId)}/action`,
          { method: "POST", body: JSON.stringify({ action: "read" }) },
        );
        data.message.isRead = true;
      }
      setDetail(data.message);
      setMessages((current) =>
        current.map((item) =>
          item.providerMessageId === message.providerMessageId
            ? { ...item, isRead: true }
            : item,
        ),
      );
    } catch (nextError) {
      setNotice(
        nextError instanceof Error
          ? nextError.message
          : "Message could not open.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const action = async (
    message: EmailMessage | EmailMessageDetail,
    next: "read" | "unread" | "star" | "unstar" | "archive",
  ) => {
    try {
      await jsonRequest(
        `/api/email/accounts/${account.id}/messages/${encodeURIComponent(message.providerMessageId)}/action`,
        { method: "POST", body: JSON.stringify({ action: next }) },
      );
      if (next === "archive") {
        setMessages((current) =>
          current.filter(
            (item) => item.providerMessageId !== message.providerMessageId,
          ),
        );
        setDetail(null);
        setSelectedId(null);
      } else {
        const patch =
          next === "read" || next === "unread"
            ? { isRead: next === "read" }
            : { isStarred: next === "star" };
        setMessages((current) =>
          current.map((item) =>
            item.providerMessageId === message.providerMessageId
              ? { ...item, ...patch }
              : item,
          ),
        );
        setDetail((current) => (current ? { ...current, ...patch } : current));
      }
    } catch (nextError) {
      setNotice(
        nextError instanceof Error ? nextError.message : "Action failed.",
      );
    }
  };

  const disconnect = async () => {
    if (
      !window.confirm(
        `Disconnect ${account.address}? Cached message metadata will be removed.`,
      )
    )
      return;
    await onRemove();
  };

  return (
    <section className="mailbox-workspace">
      <header className="mailbox-toolbar">
        <span className={`mailbox-provider-mark ${account.provider}`}>
          <ProviderIcon provider={account.provider} />
        </span>
        <div>
          <strong>{account.label}</strong>
          <small>{account.address}</small>
        </div>
        <span className={`mailbox-status ${account.status}`}>
          {account.status}
        </span>
        <span />
        <button
          className="button secondary small"
          type="button"
          onClick={() => void onSync().then(load)}
          disabled={account.status === "syncing"}
        >
          <RefreshCw
            className={account.status === "syncing" ? "spin" : ""}
            size={15}
          />{" "}
          Sync
        </button>
        <button
          className="button primary small"
          type="button"
          onClick={() => setCompose({})}
        >
          <Plus size={15} /> Compose
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={() => void disconnect()}
          aria-label={`Disconnect ${account.address}`}
        >
          <Trash2 size={16} />
        </button>
      </header>
      {(account.lastError || error || notice) && (
        <p className="mailbox-banner error">
          {notice || error || account.lastError}
        </p>
      )}
      {account.lastSyncedAt && (
        <p className="mailbox-sync-time">
          Last synchronized{" "}
          {new Intl.DateTimeFormat("en", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(account.lastSyncedAt))}
        </p>
      )}
      {compose && (
        <ComposePanel
          account={account}
          initialTo={compose.to}
          initialSubject={compose.subject}
          onClose={() => setCompose(null)}
          onSent={() => {
            setCompose(null);
            setNotice("Message sent.");
          }}
        />
      )}
      <div
        className={`mailbox-columns ${detail || detailLoading ? "reading" : ""}`}
      >
        <div
          className="mail-message-list"
          aria-label={`${account.label} messages`}
        >
          {loading && !messages.length && (
            <div className="mailbox-loading">
              <LoaderCircle className="spin" size={20} /> Loading messages…
            </div>
          )}
          {!loading && !messages.length && (
            <div className="mailbox-empty">
              <MailOpen size={28} />
              <strong>This inbox is clear</strong>
              <p>Sync to check for new mail.</p>
            </div>
          )}
          {messages.map((message) => (
            <button
              type="button"
              key={message.id}
              className={`${message.isRead ? "" : "unread"} ${selectedId === message.providerMessageId ? "active" : ""}`}
              onClick={() => void openMessage(message)}
            >
              <span className="mail-message-heading">
                <strong>{message.senderName || message.senderAddress}</strong>
                <time>
                  {new Intl.DateTimeFormat("en", {
                    month: "short",
                    day: "numeric",
                  }).format(new Date(message.receivedAt))}
                </time>
              </span>
              <span className="mail-message-subject">
                {message.isStarred && <Star size={12} fill="currentColor" />}
                {message.subject}
              </span>
              <span className="mail-message-snippet">{message.snippet}</span>
            </button>
          ))}
        </div>
        {(detail || detailLoading) && (
          <article className="mail-reader">
            {detailLoading ? (
              <div className="mailbox-loading">
                <LoaderCircle className="spin" size={20} /> Loading securely
                from {emailProviderLabels[account.provider]}…
              </div>
            ) : (
              detail && (
                <>
                  <header>
                    <button
                      className="icon-button mail-reader-back"
                      type="button"
                      onClick={() => {
                        setDetail(null);
                        setSelectedId(null);
                      }}
                      aria-label="Back to messages"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <div>
                      <h2>{detail.subject}</h2>
                      <p>
                        From{" "}
                        <strong>
                          {detail.senderName || detail.senderAddress}
                        </strong>{" "}
                        &lt;{detail.senderAddress}&gt;
                      </p>
                      <small>
                        {new Intl.DateTimeFormat("en", {
                          dateStyle: "full",
                          timeStyle: "short",
                        }).format(new Date(detail.receivedAt))}
                      </small>
                    </div>
                    <div className="mail-reader-actions">
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() =>
                          void action(
                            detail,
                            detail.isStarred ? "unstar" : "star",
                          )
                        }
                        aria-label={
                          detail.isStarred ? "Remove star" : "Star message"
                        }
                      >
                        <Star
                          size={17}
                          fill={detail.isStarred ? "currentColor" : "none"}
                        />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() =>
                          void action(detail, detail.isRead ? "unread" : "read")
                        }
                        aria-label={detail.isRead ? "Mark unread" : "Mark read"}
                      >
                        <MailOpen size={17} />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => void action(detail, "archive")}
                        aria-label="Archive"
                      >
                        <Archive size={17} />
                      </button>
                    </div>
                  </header>
                  <div className="mail-reader-body">
                    {detail.text ||
                      detail.snippet ||
                      "This message has no text body."}
                  </div>
                  {detail.attachments.length > 0 && (
                    <div className="mail-reader-attachments">
                      <strong>
                        <Paperclip size={14} /> Attachments
                      </strong>
                      {detail.attachments.map((attachment) => (
                        <a
                          className="button secondary small"
                          key={attachment.id}
                          href={`/api/email/accounts/${account.id}/messages/${encodeURIComponent(detail.providerMessageId)}/attachments/${encodeURIComponent(attachment.id)}`}
                        >
                          <Download size={14} /> {attachment.name}{" "}
                          <small>
                            {attachment.size
                              ? `${Math.ceil(attachment.size / 1024)} KB`
                              : ""}
                          </small>
                        </a>
                      ))}
                    </div>
                  )}
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      setCompose({
                        to: detail.senderAddress,
                        subject: detail.subject.toLowerCase().startsWith("re:")
                          ? detail.subject
                          : `Re: ${detail.subject}`,
                      })
                    }
                  >
                    <Reply size={15} /> Reply
                  </button>
                </>
              )
            )}
          </article>
        )}
      </div>
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
  const { supabase, status } = useAuth();
  const {
    accounts,
    configuration,
    loading,
    error,
    startOAuth,
    connectCustom,
    sync,
    remove,
  } = useEmailAccounts(ownerId, supabase);
  const [active, setActive] = useState("capture");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const result = params.get("email");
      if (result === "connected") {
        setNotice("Mailbox connected. Select its tab to synchronize mail.");
        setAdding(false);
      } else if (result === "error") {
        setNotice(params.get("reason") || "Mailbox authorization failed.");
      }
    });
  }, []);

  const selected = accounts.find((account) => account.id === active);
  const visibleActive = active === "capture" || selected ? active : "capture";
  const totalUnread = useMemo(
    () => accounts.reduce((sum, account) => sum + account.unreadCount, 0),
    [accounts],
  );

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
              {account.unreadCount > 0 && <small>{account.unreadCount}</small>}
              <span
                className={`mailbox-tab-status ${account.status}`}
                aria-label={account.status}
              />
            </button>
          ))}
          {totalUnread > 0 && (
            <span className="mailbox-total-unread">{totalUnread} unread</span>
          )}
        </nav>
        <button
          className="button primary small inbox-connect-button"
          type="button"
          onClick={() => setAdding((current) => !current)}
          aria-expanded={adding}
          disabled={status !== "signed-in"}
        >
          <Plus size={16} /> Connect email
        </button>
      </div>
      {status === "demo" && (
        <p className="mailbox-banner">
          Connect Supabase and sign in before adding synchronized mailboxes.
        </p>
      )}
      {(notice || error) && (
        <p
          className={`mailbox-banner ${error || notice.toLowerCase().includes("failed") ? "error" : ""}`}
        >
          {error || notice}
        </p>
      )}
      {adding && (
        <ConnectionForm
          configuration={configuration}
          onOAuth={startOAuth}
          onCustom={async (input) => {
            const account = await connectCustom(input);
            setActive(account.id);
            setAdding(false);
            return account;
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {loading && visibleActive !== "capture" ? (
        <div className="mailbox-loading">
          <LoaderCircle className="spin" size={20} /> Loading connected inboxes…
        </div>
      ) : visibleActive === "capture" ? (
        children
      ) : selected ? (
        <Mailbox
          account={selected}
          ownerId={ownerId}
          onSync={async () => {
            await sync(selected.id);
          }}
          onRemove={async () => {
            await remove(selected.id);
            setActive("capture");
          }}
        />
      ) : null}
    </>
  );
}
