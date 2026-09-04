"use client";

import {
  AlertCircle,
  Box,
  Check,
  ChevronRight,
  Cloud,
  Download,
  ExternalLink,
  File,
  FileImage,
  Folder,
  FolderKey,
  FolderPlus,
  HardDrive,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import {
  type FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/components/auth-provider";
import {
  formatStorageSize,
  storageProviderLabels,
  storageProviders,
  type StorageAccessMode,
  type StorageAccount,
  type StorageItem,
  type StorageProvider,
  useStorageAccounts,
  useStorageItems,
} from "@/lib/storage-accounts";

const providerDetails: Record<
  StorageProvider,
  { description: string; icon: typeof Cloud; placeholder: string }
> = {
  "google-drive": {
    description: "Personal, Workspace, and shared files.",
    icon: Cloud,
    placeholder: "you@gmail.com (optional)",
  },
  onedrive: {
    description: "Microsoft 365, OneDrive, and SharePoint.",
    icon: HardDrive,
    placeholder: "you@outlook.com (optional)",
  },
  dropbox: {
    description: "Dropbox personal, family, or team storage.",
    icon: Box,
    placeholder: "you@example.com (optional)",
  },
  webdav: {
    description: "Nextcloud, ownCloud, or hosted WebDAV.",
    icon: Server,
    placeholder: "you@example.com",
  },
};

function ProviderIcon({
  provider,
  size = 18,
}: {
  provider: StorageProvider;
  size?: number;
}) {
  const Icon = providerDetails[provider].icon;
  return <Icon size={size} />;
}

function statusLabel(account: StorageAccount) {
  if (account.status === "syncing") return "Syncing now";
  if (account.status === "error") return "Needs attention";
  if (account.status === "connecting") return "Connecting";
  return "Connected";
}

function lastSyncLabel(account: StorageAccount) {
  if (!account.lastSyncedAt) return "Not synchronized yet";
  return `Updated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(account.lastSyncedAt))}`;
}

function isImage(item: StorageItem) {
  if (item.mimeType?.startsWith("image/")) return true;
  return /\.(avif|gif|heic|jpe?g|png|svg|webp)$/i.test(item.name);
}

function FileTypeIcon({ item }: { item: StorageItem }) {
  if (item.kind === "folder") return <Folder size={18} />;
  if (isImage(item)) return <FileImage size={18} />;
  return <File size={18} />;
}

function StorageConnection({
  account,
  busy,
  onUpdate,
  onSync,
  onRemove,
}: {
  account: StorageAccount;
  busy: boolean;
  onUpdate: (
    changes: Partial<
      Pick<StorageAccount, "label" | "accessMode" | "includeInSearch">
    >,
  ) => Promise<void>;
  onSync: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  return (
    <section className="vault-connection-panel">
      <span className={`vault-provider-mark ${account.provider}`}>
        <ProviderIcon provider={account.provider} size={23} />
      </span>
      <div className="vault-connection-copy">
        <span className="kicker">
          {storageProviderLabels[account.provider]}
        </span>
        <h2>{account.label}</h2>
        <p>{account.address}</p>
        <span className={`vault-auth-status ${account.status}`}>
          {account.status === "active" && <Check size={11} />}
          {account.status === "error" && <AlertCircle size={11} />}
          {statusLabel(account)}
        </span>
        <p className="vault-setup-note">
          {account.lastError ||
            `${lastSyncLabel(account)} · ${account.itemCount.toLocaleString()} indexed items`}
        </p>
      </div>
      <div className="vault-connection-controls">
        <label>
          Storage name
          <input
            key={account.label}
            defaultValue={account.label}
            maxLength={80}
            onBlur={(event) => {
              const next = event.currentTarget.value.trim();
              if (next && next !== account.label)
                void onUpdate({ label: next });
            }}
          />
        </label>
        <label>
          File access
          <select
            value={account.accessMode}
            onChange={(event) =>
              void onUpdate({
                accessMode: event.target.value as StorageAccessMode,
              })
            }
          >
            <option value="view">View and download</option>
            <option value="manage">Upload and manage</option>
          </select>
        </label>
        <label className="vault-index-toggle">
          <input
            type="checkbox"
            checked={account.includeInSearch}
            onChange={(event) =>
              void onUpdate({ includeInSearch: event.target.checked })
            }
          />
          Include filenames in global VAULT search
        </label>
        <button
          className="button secondary small"
          type="button"
          disabled={busy || account.status === "syncing"}
          onClick={() => void onSync()}
        >
          <RefreshCw size={14} /> Sync now
        </button>
      </div>
      <button
        className="icon-button vault-remove"
        type="button"
        disabled={busy}
        onClick={() => void onRemove()}
        aria-label={`Disconnect ${account.label}`}
      >
        <Trash2 size={16} />
      </button>
    </section>
  );
}

function StorageBrowser({
  ownerId,
  accounts,
  activeAccount,
  query,
  filter,
  onQuery,
  onFilter,
  onOpenFolder,
  onGoToAccount,
}: {
  ownerId: string;
  accounts: StorageAccount[];
  activeAccount: StorageAccount | null;
  query: string;
  filter: "all" | "documents" | "images";
  onQuery: (value: string) => void;
  onFilter: (value: "all" | "documents" | "images") => void;
  onOpenFolder: (item: StorageItem) => void;
  onGoToAccount: (accountId: string, folder?: StorageItem) => void;
}) {
  const { supabase } = useAuth();
  const deferredQuery = useDeferredValue(query);
  const [path, setPath] = useState<Array<{ id: string; name: string }>>([]);
  const [folderName, setFolderName] = useState("");
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [operationError, setOperationError] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const parentId = activeAccount
    ? path.at(-1)?.id || activeAccount.rootProviderItemId
    : undefined;
  const storage = useStorageItems(ownerId, supabase, {
    accountId: activeAccount?.id,
    parentId,
    query: deferredQuery,
    kind: filter,
  });

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const openFolder = (item: StorageItem) => {
    if (!activeAccount) {
      onGoToAccount(item.accountId, item);
      return;
    }
    setPath((current) => [
      ...current,
      { id: item.providerItemId, name: item.name },
    ]);
    onOpenFolder(item);
  };

  const createFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeAccount || parentId === undefined || !folderName.trim()) return;
    setBusy("folder");
    setOperationError("");
    try {
      await storage.createFolder(activeAccount.id, parentId, folderName.trim());
      setFolderName("");
      setShowFolderForm(false);
    } catch (error) {
      setOperationError(
        error instanceof Error ? error.message : "Folder creation failed.",
      );
    } finally {
      setBusy("");
    }
  };

  const uploadFile = async (file: File | undefined) => {
    if (!file || !activeAccount || parentId === undefined) return;
    setBusy("upload");
    setProgress(0);
    setOperationError("");
    try {
      await storage.upload(activeAccount.id, parentId, file, setProgress);
    } catch (error) {
      setOperationError(
        error instanceof Error ? error.message : "Upload failed.",
      );
    } finally {
      setBusy("");
      setProgress(null);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  };

  const rename = async (item: StorageItem) => {
    const name = window.prompt("New name", item.name)?.trim();
    if (!name || name === item.name) return;
    setBusy(item.id);
    setOperationError("");
    try {
      await storage.rename(item.id, name);
    } catch (error) {
      setOperationError(
        error instanceof Error ? error.message : "Rename failed.",
      );
    } finally {
      setBusy("");
    }
  };

  const remove = async (item: StorageItem) => {
    const account = accountMap.get(item.accountId);
    const destination =
      account?.provider === "webdav" ? "permanently delete" : "remove";
    if (
      !window.confirm(
        `${destination[0].toUpperCase()}${destination.slice(1)} “${item.name}”?`,
      )
    )
      return;
    setBusy(item.id);
    setOperationError("");
    try {
      await storage.remove(item.id);
    } catch (error) {
      setOperationError(
        error instanceof Error ? error.message : "Remove failed.",
      );
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="vault-browser">
      <div className="vault-browser-toolbar">
        <label>
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search connected drives…"
            aria-label="Search VAULT files"
          />
        </label>
        <div className="vault-file-filters" aria-label="File type filter">
          <button
            type="button"
            className={filter === "all" ? "active" : ""}
            onClick={() => onFilter("all")}
          >
            <Folder size={14} /> All
          </button>
          <button
            type="button"
            className={filter === "documents" ? "active" : ""}
            onClick={() => onFilter("documents")}
          >
            <File size={14} /> Documents
          </button>
          <button
            type="button"
            className={filter === "images" ? "active" : ""}
            onClick={() => onFilter("images")}
          >
            <FileImage size={14} /> Images
          </button>
        </div>
        {activeAccount?.accessMode === "manage" && !query && (
          <div className="vault-browser-actions">
            <button
              className="button secondary small"
              type="button"
              onClick={() => setShowFolderForm((current) => !current)}
              disabled={Boolean(busy)}
            >
              <FolderPlus size={14} /> New folder
            </button>
            <button
              className="button primary small"
              type="button"
              onClick={() => uploadRef.current?.click()}
              disabled={Boolean(busy)}
            >
              <Upload size={14} /> Upload
            </button>
            <input
              ref={uploadRef}
              type="file"
              hidden
              onChange={(event) => void uploadFile(event.target.files?.[0])}
            />
          </div>
        )}
      </div>

      {activeAccount && !query && (
        <nav className="vault-breadcrumbs" aria-label="Current folder">
          <button type="button" onClick={() => setPath([])}>
            {activeAccount.label}
          </button>
          {path.map((part, index) => (
            <span key={part.id}>
              <ChevronRight size={12} />
              <button
                type="button"
                onClick={() =>
                  setPath((current) => current.slice(0, index + 1))
                }
              >
                {part.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      {showFolderForm && activeAccount && (
        <form className="vault-folder-form" onSubmit={createFolder}>
          <FolderPlus size={16} />
          <input
            autoFocus
            required
            maxLength={255}
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            placeholder="Folder name"
          />
          <button className="button primary small" disabled={busy === "folder"}>
            Create
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setShowFolderForm(false)}
          >
            Cancel
          </button>
        </form>
      )}

      {(storage.error || operationError) && (
        <p className="vault-error" role="alert">
          <AlertCircle size={15} /> {operationError || storage.error}
        </p>
      )}
      {progress !== null && (
        <div className="vault-upload-progress" aria-live="polite">
          <span>Uploading directly to {activeAccount?.label}</span>
          <progress value={progress} max={100} />
          <strong>{progress}%</strong>
        </div>
      )}

      {storage.loading ? (
        <div className="vault-empty compact">
          <LoaderCircle className="spin" size={24} />
          <h2>Loading files…</h2>
        </div>
      ) : storage.items.length ? (
        <div
          className="vault-file-list"
          role="table"
          aria-label="Storage files"
        >
          <div className="vault-file-row heading" role="row">
            <span>Name</span>
            <span>Storage</span>
            <span>Modified</span>
            <span>Size</span>
            <span>Actions</span>
          </div>
          {storage.items.map((item) => {
            const account = accountMap.get(item.accountId);
            const managing = account?.accessMode === "manage" && item.canEdit;
            return (
              <div className="vault-file-row" role="row" key={item.id}>
                <button
                  className="vault-file-name"
                  type="button"
                  onClick={() =>
                    item.kind === "folder"
                      ? openFolder(item)
                      : item.webUrl
                        ? window.open(
                            item.webUrl,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        : undefined
                  }
                >
                  <span className={`vault-file-icon ${item.kind}`}>
                    <FileTypeIcon item={item} />
                  </span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.kind === "folder"
                        ? "Folder"
                        : item.mimeType || "File"}
                    </small>
                  </span>
                </button>
                <span className="vault-file-provider">
                  {account && (
                    <ProviderIcon provider={account.provider} size={14} />
                  )}
                  {account?.label || "Storage"}
                </span>
                <span>
                  {item.modifiedAt
                    ? new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                      }).format(new Date(item.modifiedAt))
                    : "—"}
                </span>
                <span>
                  {item.kind === "folder"
                    ? "—"
                    : formatStorageSize(item.sizeBytes)}
                </span>
                <span className="vault-file-actions">
                  {item.kind === "file" && item.canDownload && (
                    <a
                      className="icon-button"
                      href={`/api/storage/items/${item.id}/download`}
                      aria-label={`Download ${item.name}`}
                    >
                      <Download size={14} />
                    </a>
                  )}
                  {item.webUrl && (
                    <a
                      className="icon-button"
                      href={item.webUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${item.name} with provider`}
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                  {managing && (
                    <button
                      className="icon-button"
                      type="button"
                      disabled={busy === item.id}
                      onClick={() => void rename(item)}
                      aria-label={`Rename ${item.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {managing && (
                    <button
                      className="icon-button danger"
                      type="button"
                      disabled={busy === item.id}
                      onClick={() => void remove(item)}
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="vault-empty">
          <span>
            <FolderKey size={23} />
          </span>
          <h2>{query ? "No indexed file matches" : "This folder is empty"}</h2>
          <p>
            {query
              ? `Nothing matches “${query}” in the connected storage index.`
              : activeAccount?.accessMode === "manage"
                ? "Upload a file or create a folder. It will be saved directly with your provider."
                : "Synchronize the account after adding files with your provider."}
          </p>
        </div>
      )}
      <footer className="vault-browser-footer">
        <span>
          <ShieldCheck size={13} /> File contents stay with their provider
        </span>
        <span>Only private metadata is indexed in Jarins</span>
      </footer>
    </section>
  );
}

export function VaultHub({ ownerId }: { ownerId: string }) {
  const { supabase, status } = useAuth();
  const storage = useStorageAccounts(ownerId, supabase);
  const [active, setActive] = useState("all");
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<StorageProvider>("google-drive");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [accessMode, setAccessMode] = useState<StorageAccessMode>("view");
  const [includeInSearch, setIncludeInSearch] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "documents" | "images">("all");
  const [busy, setBusy] = useState("");
  const [formError, setFormError] = useState("");
  const selected =
    storage.accounts.find((account) => account.id === active) || null;
  const visibleActive = active === "all" || selected ? active : "all";

  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("storage");
    if (outcome === "error")
      queueMicrotask(() =>
        setFormError(
          url.searchParams.get("reason") || "Storage authorization failed.",
        ),
      );
    if (outcome) {
      url.searchParams.delete("storage");
      url.searchParams.delete("reason");
      window.history.replaceState(null, "", url);
    }
  }, []);

  const resetForm = () => {
    setAddress("");
    setLabel("");
    setUsername("");
    setPassword("");
    setServerUrl("");
    setAccessMode("view");
    setIncludeInSearch(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("connect");
    setFormError("");
    try {
      const storageLabel = label.trim() || storageProviderLabels[provider];
      if (provider === "webdav") {
        const account = await storage.connectWebDav({
          address,
          label: storageLabel,
          username,
          password,
          serverUrl,
          accessMode,
          includeInSearch,
        });
        setActive(account.id);
        setAdding(false);
        resetForm();
      } else {
        await storage.startOAuth(provider, {
          label: storageLabel,
          expectedAddress: address,
          accessMode,
          includeInSearch,
        });
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Storage connection failed.",
      );
      setBusy("");
    }
  };

  const configured = storage.configuration
    ? provider === "google-drive"
      ? storage.configuration.googleDrive
      : provider === "onedrive"
        ? storage.configuration.onedrive
        : provider === "dropbox"
          ? storage.configuration.dropbox
          : storage.configuration.webdav
    : false;

  if (status === "demo") {
    return (
      <section className="vault-browser">
        <div className="vault-empty">
          <span>
            <ShieldCheck size={23} />
          </span>
          <h2>Connect Supabase first</h2>
          <p>
            VAULT keeps encrypted provider credentials and a private filename
            index in your account, so it is unavailable in browser-only demo
            mode.
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="vault-master-card">
        <span className="vault-master-icon">
          <FolderKey size={23} />
        </span>
        <div>
          <span className="kicker">External storage · one private index</span>
          <h2>VAULT</h2>
          <p>
            Browse, search, download, and manage files without storing copies in
            Jarins.
          </p>
        </div>
        <div className="vault-master-stats">
          <span>
            <strong>{storage.accounts.length}</strong> providers
          </span>
          <span>
            <strong>
              {storage.accounts
                .reduce((sum, account) => sum + account.itemCount, 0)
                .toLocaleString()}
            </strong>
            indexed items
          </span>
          <span>
            <strong>0 B</strong> file content here
          </span>
        </div>
      </section>

      <div className="vault-account-bar">
        <nav className="vault-account-tabs" aria-label="Storage services">
          <button
            type="button"
            className={visibleActive === "all" ? "active" : ""}
            onClick={() => setActive("all")}
          >
            <Folder size={16} />
            <span>All files</span>
            <small>{storage.accounts.length}</small>
          </button>
          {storage.accounts.map((account) => (
            <button
              type="button"
              key={account.id}
              className={visibleActive === account.id ? "active" : ""}
              onClick={() => setActive(account.id)}
              title={account.address}
            >
              <ProviderIcon provider={account.provider} />
              <span>{account.label}</span>
              {account.status === "active" ? (
                <Check size={13} />
              ) : (
                <AlertCircle size={13} />
              )}
            </button>
          ))}
        </nav>
        <button
          className="button primary small vault-connect-button"
          type="button"
          onClick={() => setAdding((current) => !current)}
          aria-expanded={adding}
          disabled={status !== "signed-in"}
        >
          <Plus size={16} /> Connect storage
        </button>
      </div>

      {(storage.error || formError) && (
        <p className="vault-error" role="alert">
          <AlertCircle size={15} /> {formError || storage.error}
        </p>
      )}

      {adding && (
        <section className="vault-connect" aria-label="Connect storage">
          <div className="vault-connect-heading">
            <div>
              <span className="eyebrow">Bring your files within reach</span>
              <h2>Choose a storage provider</h2>
              <p>
                OAuth providers never share your password with Jarins. WebDAV
                credentials are encrypted before storage.
              </p>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
          <div className="vault-provider-grid">
            {storageProviders.map((item) => (
              <button
                type="button"
                key={item}
                className={provider === item ? "active" : ""}
                onClick={() => setProvider(item)}
              >
                <span className={`vault-provider-mark ${item}`}>
                  <ProviderIcon provider={item} size={21} />
                </span>
                <strong>{storageProviderLabels[item]}</strong>
                <small>{providerDetails[item].description}</small>
              </button>
            ))}
          </div>
          <form
            className={`vault-connect-form ${provider === "webdav" ? "webdav" : ""}`}
            onSubmit={submit}
          >
            <label>
              {provider === "webdav"
                ? "Account email or name"
                : "Account email (optional)"}
              <input
                type={provider === "webdav" ? "text" : "email"}
                required={provider === "webdav"}
                maxLength={320}
                placeholder={providerDetails[provider].placeholder}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </label>
            <label>
              Storage name
              <input
                maxLength={80}
                placeholder="Family Drive, Work files…"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
            {provider === "webdav" && (
              <>
                <label>
                  WebDAV URL
                  <input
                    type="url"
                    required
                    maxLength={2048}
                    placeholder="https://cloud.example.com/remote.php/dav/files/you/"
                    value={serverUrl}
                    onChange={(event) => setServerUrl(event.target.value)}
                  />
                </label>
                <label>
                  Username
                  <input
                    required
                    maxLength={320}
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>
                <label>
                  App password
                  <input
                    type="password"
                    required
                    maxLength={2048}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
              </>
            )}
            <label>
              Access level
              <select
                value={accessMode}
                onChange={(event) =>
                  setAccessMode(event.target.value as StorageAccessMode)
                }
              >
                <option value="view">View and download</option>
                <option value="manage">Upload and manage</option>
              </select>
            </label>
            <label className="vault-index-toggle setup">
              <input
                type="checkbox"
                checked={includeInSearch}
                onChange={(event) => setIncludeInSearch(event.target.checked)}
              />
              Include filenames in search
            </label>
            <button
              className="button primary"
              type="submit"
              disabled={busy === "connect" || !configured}
            >
              {busy === "connect" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Plus size={16} />
              )}
              {provider === "webdav"
                ? "Connect WebDAV"
                : `Continue with ${storageProviderLabels[provider]}`}
            </button>
          </form>
          {!configured && storage.configuration && (
            <p className="vault-error compact">
              <AlertCircle size={13} /> This provider needs its server
              credentials configured before it can connect.
            </p>
          )}
          <p className="vault-security-note">
            <ShieldCheck size={13} /> Access can be revoked at any time by
            disconnecting the tab.
          </p>
        </section>
      )}

      {selected && (
        <StorageConnection
          account={selected}
          busy={Boolean(busy)}
          onUpdate={async (changes) => {
            setBusy("settings");
            setFormError("");
            try {
              await storage.update(selected.id, changes);
            } catch (error) {
              setFormError(
                error instanceof Error ? error.message : "Settings failed.",
              );
            } finally {
              setBusy("");
            }
          }}
          onSync={async () => {
            setBusy("sync");
            setFormError("");
            try {
              await storage.sync(selected.id);
            } catch (error) {
              setFormError(
                error instanceof Error ? error.message : "Sync failed.",
              );
            } finally {
              setBusy("");
            }
          }}
          onRemove={async () => {
            if (
              !window.confirm(
                `Disconnect “${selected.label}”? Its files stay with ${storageProviderLabels[selected.provider]}.`,
              )
            )
              return;
            setBusy("remove");
            try {
              await storage.remove(selected.id);
              setActive("all");
            } catch (error) {
              setFormError(
                error instanceof Error ? error.message : "Disconnect failed.",
              );
            } finally {
              setBusy("");
            }
          }}
        />
      )}

      {storage.loading ? (
        <section className="vault-browser">
          <div className="vault-empty">
            <LoaderCircle className="spin" size={24} />
            <h2>Loading VAULT…</h2>
          </div>
        </section>
      ) : storage.accounts.length ? (
        <StorageBrowser
          key={selected?.id || "all"}
          ownerId={ownerId}
          accounts={storage.accounts}
          activeAccount={selected}
          query={query}
          filter={filter}
          onQuery={setQuery}
          onFilter={setFilter}
          onOpenFolder={() => setQuery("")}
          onGoToAccount={(accountId) => {
            setActive(accountId);
            setQuery("");
          }}
        />
      ) : (
        <section className="vault-browser">
          <div className="vault-empty">
            <span>
              <FolderKey size={23} />
            </span>
            <h2>Connect your first drive</h2>
            <p>
              Your provider keeps every file. VAULT adds a private metadata
              index so you can find, download, and use it throughout Jarins.
            </p>
            <button
              className="button primary small"
              type="button"
              onClick={() => setAdding(true)}
            >
              <Plus size={15} /> Connect storage
            </button>
          </div>
          <footer className="vault-browser-footer">
            <span>
              <ShieldCheck size={13} /> File contents stay with their provider
            </span>
            <span>0 B stored in VAULT</span>
          </footer>
        </section>
      )}
    </>
  );
}
