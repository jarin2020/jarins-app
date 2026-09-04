"use client";

import {
  Box,
  Check,
  ChevronRight,
  Cloud,
  File,
  FileImage,
  Folder,
  FolderKey,
  HardDrive,
  Link2,
  Plus,
  Search,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  storageProviderLabels,
  storageProviders,
  type StorageAccessMode,
  type StorageAccount,
  type StorageProvider,
  useStorageAccounts,
} from "@/lib/storage-accounts";

const providerDetails: Record<
  StorageProvider,
  { description: string; icon: typeof Cloud; placeholder: string }
> = {
  "google-drive": {
    description: "Personal, Workspace, and shared drives.",
    icon: Cloud,
    placeholder: "you@gmail.com",
  },
  onedrive: {
    description: "Microsoft 365, OneDrive, and SharePoint files.",
    icon: HardDrive,
    placeholder: "you@outlook.com",
  },
  dropbox: {
    description: "Dropbox personal, family, or team storage.",
    icon: Box,
    placeholder: "you@example.com",
  },
  webdav: {
    description: "Nextcloud, ownCloud, NAS, or custom WebDAV.",
    icon: Server,
    placeholder: "https://cloud.example.com/dav",
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

function StorageConnection({
  account,
  onUpdate,
  onRemove,
}: {
  account: StorageAccount;
  onUpdate: (
    changes: Pick<StorageAccount, "accessMode" | "includeInSearch">,
  ) => void;
  onRemove: () => void;
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
        <span className="vault-auth-status">Authorization required</span>
        <p className="vault-setup-note">
          Finish secure authorization to browse and link files. VAULT keeps a
          searchable reference; the original file and its contents stay with
          this provider.
        </p>
      </div>
      <div className="vault-connection-controls">
        <label>
          File access
          <select
            value={account.accessMode}
            onChange={(event) =>
              onUpdate({
                accessMode: event.target.value as StorageAccessMode,
                includeInSearch: account.includeInSearch,
              })
            }
          >
            <option value="view">View and link only</option>
            <option value="manage">Manage files</option>
          </select>
        </label>
        <label className="vault-index-toggle">
          <input
            type="checkbox"
            checked={account.includeInSearch}
            onChange={(event) =>
              onUpdate({
                accessMode: account.accessMode,
                includeInSearch: event.target.checked,
              })
            }
          />
          Include filenames in Jarins search
        </label>
        <button className="button primary small" type="button" disabled>
          Finish authorization <ChevronRight size={15} />
        </button>
      </div>
      <button
        className="icon-button vault-remove"
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${account.label}`}
      >
        <Trash2 size={16} />
      </button>
    </section>
  );
}

export function VaultHub({ ownerId }: { ownerId: string }) {
  const { accounts, add, update, remove } = useStorageAccounts(ownerId);
  const [active, setActive] = useState("all");
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<StorageProvider>("google-drive");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [accessMode, setAccessMode] = useState<StorageAccessMode>("view");
  const [includeInSearch, setIncludeInSearch] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "documents" | "images">("all");

  const selected = accounts.find((account) => account.id === active);
  const visibleActive = active === "all" || selected ? active : "all";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = add({
      provider,
      address,
      label: label.trim() || storageProviderLabels[provider],
      accessMode,
      includeInSearch,
    });
    setActive(account.id);
    setAdding(false);
    setAddress("");
    setLabel("");
    setAccessMode("view");
    setIncludeInSearch(true);
  };

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
            Find and use files from your storage providers without copying their
            contents into Jarins.
          </p>
        </div>
        <div className="vault-master-stats">
          <span>
            <strong>{accounts.length}</strong> providers
          </span>
          <span>
            <strong>0 B</strong> stored here
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
            <small>{accounts.length}</small>
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
              {account.includeInSearch && <Check size={13} />}
            </button>
          ))}
        </nav>
        <button
          className="button primary small vault-connect-button"
          type="button"
          onClick={() => setAdding((current) => !current)}
          aria-expanded={adding}
        >
          <Plus size={16} /> Connect storage
        </button>
      </div>

      {adding && (
        <section className="vault-connect" aria-label="Connect storage">
          <div className="vault-connect-heading">
            <div>
              <span className="eyebrow">Bring your files within reach</span>
              <h2>Choose a storage provider</h2>
              <p>
                Add a provider now and complete its secure connection when OAuth
                or WebDAV is configured.
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
          <form className="vault-connect-form" onSubmit={submit}>
            <label>
              {provider === "webdav" ? "Server address" : "Account email"}
              <input
                type={provider === "webdav" ? "url" : "email"}
                required
                maxLength={255}
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
            <label>
              Access level
              <select
                value={accessMode}
                onChange={(event) =>
                  setAccessMode(event.target.value as StorageAccessMode)
                }
              >
                <option value="view">View and link only</option>
                <option value="manage">Manage files</option>
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
            <button className="button primary" type="submit">
              Add storage tab <ChevronRight size={16} />
            </button>
          </form>
          <p className="vault-security-note">
            <ShieldCheck size={13} /> Provider tokens belong in encrypted
            server-side secrets. VAULT never asks for or stores your password.
          </p>
        </section>
      )}

      {visibleActive === "all" ? (
        <section className="vault-browser">
          <div className="vault-browser-toolbar">
            <label>
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search connected drives…"
                aria-label="Search VAULT files"
              />
            </label>
            <div className="vault-file-filters" aria-label="File type filter">
              <button
                type="button"
                className={filter === "all" ? "active" : ""}
                onClick={() => setFilter("all")}
              >
                <Folder size={14} /> All
              </button>
              <button
                type="button"
                className={filter === "documents" ? "active" : ""}
                onClick={() => setFilter("documents")}
              >
                <File size={14} /> Documents
              </button>
              <button
                type="button"
                className={filter === "images" ? "active" : ""}
                onClick={() => setFilter("images")}
              >
                <FileImage size={14} /> Images
              </button>
            </div>
          </div>
          <div className="vault-empty">
            <span>
              <Link2 size={23} />
            </span>
            <h2>
              {query ? "No indexed file matches" : "Connect your first drive"}
            </h2>
            <p>
              {query
                ? `Nothing matches “${query}” in the connected storage index.`
                : "Your provider keeps every file. VAULT adds a lightweight index so you can find, link, and use it throughout Jarins."}
            </p>
            {!accounts.length && (
              <button
                className="button primary small"
                type="button"
                onClick={() => setAdding(true)}
              >
                <Plus size={15} /> Connect storage
              </button>
            )}
          </div>
          <footer className="vault-browser-footer">
            <span>
              <ShieldCheck size={13} /> File contents stay with their provider
            </span>
            <span>Metadata is indexed only when you allow it</span>
          </footer>
        </section>
      ) : selected ? (
        <StorageConnection
          account={selected}
          onUpdate={(changes) => update(selected.id, changes)}
          onRemove={() => {
            remove(selected.id);
            setActive("all");
          }}
        />
      ) : null}
    </>
  );
}
