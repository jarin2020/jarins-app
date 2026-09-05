"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  ChevronDown,
  Command,
  Database,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { primaryModules, utilityModules } from "@/lib/modules";
import dynamic from "next/dynamic";

/**
 * The largest component in the shell, and closed on arrival. It still mounts —
 * it is what reports the unread count to the badge — but it no longer sits in
 * the chunk that has to arrive before the page is interactive.
 */
const MessageCenter = dynamic(
  () => import("./message-center").then((m) => m.MessageCenter),
  { ssr: false },
);
import { QuickCapture } from "./quick-capture";
import { usePreferences } from "@/lib/preferences-store";
import { useAuth } from "./auth-provider";
import { getInitials } from "@/lib/account-profile";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const { preferences } = usePreferences();
  const { profile, status, signOut, user } = useAuth();
  const displayName =
    status === "signed-in" && profile
      ? profile.displayName
      : status === "demo"
        ? preferences.name
        : status === "signed-out"
          ? "Sign in"
          : "Account";
  const initials =
    status === "signed-in" && profile
      ? profile.initials
      : getInitials(displayName);

  const openCapture = useCallback(() => setCaptureOpen(true), []);
  const openMessages = useCallback(() => setMessagesOpen(true), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCapture();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openCapture]);

  useEffect(() => {
    window.addEventListener("jarins-open-capture", openCapture);
    window.addEventListener("jarins-open-messages", openMessages);
    return () => {
      window.removeEventListener("jarins-open-capture", openCapture);
      window.removeEventListener("jarins-open-messages", openMessages);
    };
  }, [openCapture, openMessages]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node))
        setAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  const navigateSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (search.trim())
      router.push(`/search?q=${encodeURIComponent(search.trim())}`);
  };

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
        aria-label="Primary navigation"
      >
        <div className="brand-row">
          <Link href="/home" className="brand" aria-label="jarins home">
            <span className="brand-mark">j.</span>
            <span>
              <strong>jarins</strong>
              <small>Life OS</small>
            </span>
          </Link>
          <button
            className="icon-button mobile-only"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>
        <nav className="nav-list">
          {primaryModules.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={pathname.startsWith(href) ? "active" : ""}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="nav-divider" />
        <nav className="nav-list nav-utility">
          {utilityModules.slice(0, 3).map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={pathname.startsWith(href) ? "active" : ""}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <button
          className="sidebar-capture"
          type="button"
          onClick={openCapture}
          aria-label="Quick capture a task, note or reminder"
        >
          <span className="sidebar-capture-icon">
            <Plus size={18} />
          </span>
          <span className="sidebar-capture-copy">
            <strong>Quick capture</strong>
            <small>Task, note or reminder</small>
          </span>
          <kbd>
            <Command size={11} />K
          </kbd>
        </button>
      </aside>

      {mobileOpen && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <main className="main-column">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <form className="search-box" onSubmit={navigateSearch} role="search">
            <Search size={17} />
            <input
              id="global-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tasks, people, documents…"
              aria-label="Search jarins"
            />
            <kbd>⌘ S</kbd>
          </form>
          <div className="top-actions">
            <Link
              href="/calendar"
              className="icon-button"
              aria-label="Upcoming reminders"
            >
              <Bell size={18} />
            </Link>
            {status === "signed-out" ? (
              <Link className="profile-chip" href="/auth/login">
                <span>
                  <LogIn size={14} />
                </span>
                <b>Sign in</b>
              </Link>
            ) : (
              <div className="account-menu" ref={accountMenuRef}>
                <button
                  className="profile-chip"
                  type="button"
                  disabled={status === "loading"}
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  aria-label={`Open account menu for ${displayName}`}
                  onClick={() => setAccountMenuOpen((open) => !open)}
                >
                  <span>{initials}</span>
                  <b>{displayName}</b>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                {accountMenuOpen && (
                  <div className="account-menu-panel" role="menu">
                    <div className="account-menu-identity">
                      <span>{initials}</span>
                      <div>
                        <strong>{displayName}</strong>
                        <small>
                          {status === "signed-in"
                            ? profile?.email || "Signed-in account"
                            : "Saved on this device"}
                        </small>
                      </div>
                    </div>
                    <div className="account-menu-links">
                      <Link
                        href="/settings/profile"
                        role="menuitem"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <UserRound size={16} /> Profile
                      </Link>
                      <Link
                        href="/settings/household"
                        role="menuitem"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <UsersRound size={16} /> Household
                      </Link>
                      <Link
                        href="/settings/notifications"
                        role="menuitem"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <BellRing size={16} /> Notifications
                      </Link>
                      <Link
                        href="/settings/privacy"
                        role="menuitem"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <ShieldCheck size={16} /> Privacy
                      </Link>
                      <Link
                        href="/settings/data"
                        role="menuitem"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        <Database size={16} /> Data &amp; export
                      </Link>
                      {status === "demo" && (
                        <Link
                          href="/auth/login"
                          role="menuitem"
                          onClick={() => setAccountMenuOpen(false)}
                        >
                          <LogIn size={16} /> About accounts
                        </Link>
                      )}
                    </div>
                    {status === "signed-in" && (
                      <button
                        className="account-menu-signout"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          void signOut();
                        }}
                      >
                        <LogOut size={16} /> Sign out
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>

      <button
        className="message-fab"
        onClick={openMessages}
        aria-label="Open messages"
      >
        <MessageCircle size={19} />
        <span>Messages</span>
        {messageUnreadCount > 0 && (
          <b className="message-fab-badge">
            {messageUnreadCount > 99 ? "99+" : messageUnreadCount}
          </b>
        )}
      </button>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {primaryModules
          .filter((item) => ["home", "today", "family"].includes(item.key))
          .map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={pathname.startsWith(href) ? "active" : ""}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ))}
        <button className="mobile-capture" onClick={openCapture}>
          <Plus size={22} />
          <span>Capture</span>
        </button>
        <button onClick={() => setMobileOpen(true)}>
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>
      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <MessageCenter
        open={messagesOpen}
        onClose={() => setMessagesOpen(false)}
        ownerId={user?.id ?? "local"}
        author={displayName}
        onUnreadCountChange={setMessageUnreadCount}
      />
    </div>
  );
}
