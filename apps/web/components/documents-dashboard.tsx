"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  FileCheck2,
  FileClock,
  FileText,
  FolderKey,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo } from "react";
import { useAuth } from "@/components/auth-provider";
import type { LifeRecord } from "@/lib/jarins-store";
import {
  formatStorageSize,
  storageProviderLabels,
  useStorageAccounts,
  useStorageItems,
} from "@/lib/storage-accounts";
import { useClientNow } from "@/lib/use-client-now";

type Props = {
  records: LifeRecord[];
  loading: boolean;
  update: (id: string, changes: Partial<LifeRecord>) => Promise<void>;
};

function localDateKey(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function daysUntil(value: string, today: string) {
  return Math.ceil(
    (new Date(`${value}T12:00:00`).getTime() -
      new Date(`${today}T12:00:00`).getTime()) /
      86_400_000,
  );
}

export function DocumentsDashboard({ records, loading, update }: Props) {
  const now = useClientNow();
  const { supabase, user, status } = useAuth();
  const ownerId = user?.id ?? "local";
  const storage = useStorageAccounts(ownerId, supabase);
  const vault = useStorageItems(ownerId, supabase, {
    kind: "documents",
    enabled: storage.accounts.some((account) => account.status === "active"),
  });
  const today = now ? localDateKey(now) : "";
  const horizon = now
    ? localDateKey(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90),
      )
    : "";
  const documents = useMemo(
    () => records.filter((record) => record.module === "documents"),
    [records],
  );
  const open = documents.filter((record) => record.status !== "done");
  const expired = open.filter((record) => record.date && record.date < today);
  const expiring = open.filter(
    (record) => record.date && record.date >= today && record.date <= horizon,
  );
  const attention = [...expired, ...expiring]
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .slice(0, 7);
  const secured = documents.filter((record) =>
    /sensitive|private|confidential/i.test(record.detail),
  ).length;
  const categories = [...new Set(documents.map((record) => record.kind))]
    .map((kind) => ({
      kind,
      count: documents.filter((record) => record.kind === kind).length,
      open: open.filter((record) => record.kind === kind).length,
      next: open
        .filter((record) => record.kind === kind && record.date)
        .sort((a, b) => a.date!.localeCompare(b.date!))[0],
    }))
    .sort((a, b) => b.count - a.count);
  const recent = [...documents]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);
  const indexedItems = storage.accounts.reduce(
    (sum, account) => sum + account.itemCount,
    0,
  );

  return (
    <div className="documents-command-dashboard">
      <section className="documents-dashboard-hero">
        <div>
          <span className="eyebrow light">Your document control centre</span>
          <h2>Know what you have, where it is, and what expires next.</h2>
          <p>
            Track important records here while connected storage keeps the
            original files with your chosen provider.
          </p>
          <div className="documents-hero-actions">
            <button
              type="button"
              className="button light"
              onClick={() =>
                window.dispatchEvent(new Event("jarins-open-capture"))
              }
            >
              <Plus size={15} /> Add document record
            </button>
            <Link href="/vault" className="button glass">
              <FolderKey size={15} /> Open VAULT
            </Link>
          </div>
        </div>
        <div className="documents-security-summary">
          <span>
            <ShieldCheck size={15} />{" "}
            {status === "demo" ? "Local index" : "Private account index"}
          </span>
          <strong>{loading ? "—" : documents.length}</strong>
          <small>tracked document records</small>
        </div>
      </section>

      <section
        className="documents-quick-actions"
        aria-label="Document actions"
      >
        <Link href="/search">
          <span>
            <Search size={18} />
          </span>
          <strong>Search everything</strong>
          <small>Records and connected files</small>
        </Link>
        <Link href="/documents/expiring">
          <span>
            <CalendarClock size={18} />
          </span>
          <strong>Expiry review</strong>
          <small>
            {expired.length + expiring.length}{" "}
            {expired.length + expiring.length === 1
              ? "item needs"
              : "items need"}{" "}
            review
          </small>
        </Link>
        <Link href="/documents/categories">
          <span>
            <FileText size={18} />
          </span>
          <strong>Categories</strong>
          <small>{categories.length} document groups</small>
        </Link>
        <Link href="/vault">
          <span>
            <FolderKey size={18} />
          </span>
          <strong>Storage connections</strong>
          <small>{storage.accounts.length} connected drives</small>
        </Link>
      </section>

      <section
        className="documents-dashboard-stats"
        aria-label="Document status"
      >
        <article>
          <span className="urgent">
            <CircleAlert size={17} />
          </span>
          <div>
            <strong>{loading ? "—" : expired.length}</strong>
            <small>Expired</small>
          </div>
        </article>
        <article>
          <span className="warm">
            <FileClock size={17} />
          </span>
          <div>
            <strong>{loading ? "—" : expiring.length}</strong>
            <small>Expiring in 90 days</small>
          </div>
        </article>
        <article>
          <span>
            <LockKeyhole size={17} />
          </span>
          <div>
            <strong>{loading ? "—" : secured}</strong>
            <small>Marked sensitive</small>
          </div>
        </article>
        <article>
          <span className="career">
            <FolderKey size={17} />
          </span>
          <div>
            <strong>{storage.loading ? "—" : indexedItems}</strong>
            <small>VAULT items indexed</small>
          </div>
        </article>
      </section>

      <div className="documents-dashboard-grid">
        <section
          className="documents-dashboard-card attention"
          aria-labelledby="document-attention-title"
        >
          <header>
            <div>
              <span className="eyebrow">Renewals and deadlines</span>
              <h2 id="document-attention-title">Needs attention</h2>
            </div>
            <Link href="/documents/expiring" className="text-button">
              See all <ChevronRight size={14} />
            </Link>
          </header>
          {loading ? (
            <p className="documents-dashboard-empty">
              Loading document deadlines…
            </p>
          ) : attention.length ? (
            <div className="document-attention-list">
              {attention.map((record) => {
                const remaining = daysUntil(record.date!, today);
                return (
                  <article key={record.id}>
                    <span className={remaining < 0 ? "expired" : "soon"}>
                      <FileClock size={16} />
                    </span>
                    <Link href="/documents/expiring">
                      <strong>{record.title}</strong>
                      <small>
                        {record.kind} · {dateLabel(record.date!)}
                      </small>
                    </Link>
                    <b className={remaining < 0 ? "expired" : ""}>
                      {remaining < 0
                        ? `${Math.abs(remaining)}d overdue`
                        : remaining === 0
                          ? "Today"
                          : `${remaining}d left`}
                    </b>
                    <button
                      type="button"
                      aria-label={`Mark ${record.title} handled`}
                      onClick={() =>
                        void update(record.id, {
                          status: "done",
                          progress: 100,
                        })
                      }
                    >
                      <Check size={14} />
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="documents-dashboard-empty">
              <FileCheck2 size={20} />
              <strong>No expiry actions</strong>
              <p>
                Add an expiry date to any document record to keep it visible
                here.
              </p>
            </div>
          )}
        </section>

        <section
          className="documents-dashboard-card vault-preview"
          aria-labelledby="document-vault-title"
        >
          <header>
            <div>
              <span className="eyebrow">Connected files</span>
              <h2 id="document-vault-title">Documents in VAULT</h2>
            </div>
            <Link href="/vault" className="text-button">
              Open VAULT <ChevronRight size={14} />
            </Link>
          </header>
          {storage.error || vault.error ? (
            <p className="documents-dashboard-error">
              {storage.error || vault.error}
            </p>
          ) : vault.items.length ? (
            <div className="document-vault-list">
              {vault.items.slice(0, 6).map((item) => {
                const account = storage.accounts.find(
                  (entry) => entry.id === item.accountId,
                );
                const href =
                  item.kind === "file" && item.canDownload
                    ? `/api/storage/items/${item.id}/download`
                    : "/vault";
                return (
                  <a href={href} key={item.id}>
                    <span>
                      <FileText size={16} />
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {storageProviderLabels[account?.provider ?? "webdav"]} ·{" "}
                        {formatStorageSize(item.sizeBytes)}
                      </small>
                    </div>
                    <ChevronRight size={14} />
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="documents-dashboard-empty">
              <FolderKey size={20} />
              <strong>Connect your document storage</strong>
              <p>
                Google Drive, OneDrive, Dropbox, and WebDAV files can be indexed
                without copying them into Jarins.
              </p>
              <Link href="/vault" className="button secondary small">
                Manage storage
              </Link>
            </div>
          )}
        </section>
      </div>

      <section
        className="document-category-overview"
        aria-labelledby="document-categories-title"
      >
        <header>
          <div>
            <span className="eyebrow">Coverage</span>
            <h2 id="document-categories-title">Document categories</h2>
          </div>
          <Link href="/documents/categories" className="text-button">
            Manage categories <ChevronRight size={14} />
          </Link>
        </header>
        {categories.length ? (
          <div>
            {categories.map((category, index) => (
              <Link href="/documents/categories" key={category.kind}>
                <span className={`document-category-icon tone-${index % 4}`}>
                  <FileText size={18} />
                </span>
                <div>
                  <strong>{category.kind}</strong>
                  <small>
                    {category.count} saved · {category.open} active
                  </small>
                  <p>
                    {category.next
                      ? `Next: ${category.next.title}`
                      : "No pending action"}
                  </p>
                </div>
                <ArrowRight size={15} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="documents-dashboard-empty">
            <FileText size={20} />
            <strong>No document categories yet</strong>
            <p>Your first document record will create one automatically.</p>
          </div>
        )}
      </section>

      <div className="documents-lower-grid">
        <section
          className="documents-dashboard-card recent"
          aria-labelledby="recent-documents-title"
        >
          <header>
            <div>
              <span className="eyebrow">Recently updated</span>
              <h2 id="recent-documents-title">Document index</h2>
            </div>
          </header>
          <div className="document-recent-list">
            {recent.map((record) => (
              <Link href="/documents" key={record.id}>
                <span>
                  <FileText size={16} />
                </span>
                <div>
                  <strong>{record.title}</strong>
                  <small>
                    {record.kind} · {record.status}
                  </small>
                </div>
                {record.status === "done" ? (
                  <FileCheck2 size={15} />
                ) : (
                  <ChevronRight size={15} />
                )}
              </Link>
            ))}
          </div>
        </section>
        <aside className="documents-privacy-card">
          <span>
            <LockKeyhole size={22} />
          </span>
          <div>
            <span className="eyebrow">Privacy boundary</span>
            <h2>Files stay with their provider</h2>
            <p>
              Jarins stores a private searchable index and encrypted connection
              credentials. Provider permissions still control access to the
              originals.
            </p>
          </div>
          <Link href="/settings/privacy">
            Privacy settings <ArrowRight size={14} />
          </Link>
        </aside>
      </div>
    </div>
  );
}
