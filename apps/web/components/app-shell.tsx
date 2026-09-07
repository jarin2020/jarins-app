"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  ChevronDown,
  Database,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { findWorkspace, utilityModules, workspaces } from "@/lib/modules";
import { resolveProject, withProject } from "@/lib/projects";
import dynamic from "next/dynamic";

/**
 * The largest component in the shell, and closed on arrival. It still mounts —
 * it is what reports the unread count to the badge — but it no longer sits in
 * the chunk that has to arrive before the page is interactive.
 */
const ProjectEditor = dynamic(
  () => import("./project-editor").then((m) => m.ProjectEditor),
  { ssr: false },
);
const SearchOverlay = dynamic(
  () => import("./search-overlay").then((m) => m.SearchOverlay),
  { ssr: false },
);
const MessageCenter = dynamic(
  () => import("./message-center").then((m) => m.MessageCenter),
  { ssr: false },
);
import { QuickCapture } from "./quick-capture";
import { usePreferences } from "@/lib/preferences-store";
import { useAuth } from "./auth-provider";
import { ProfileAvatar } from "./profile-avatar";
import { getInitials } from "@/lib/account-profile";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const { preferences, save: savePreferences } = usePreferences();
  const workspace = findWorkspace(preferences.workspace);
  const project = resolveProject(preferences, workspace.id);
  const [projectEditorOpen, setProjectEditorOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { profile, status, signOut, user, avatarUrl } = useAuth();
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
  const accent = status === "signed-in" ? profile?.accent : undefined;

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
        setSearchOpen(true);
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

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
        aria-label="Primary navigation"
      >
        <div className="brand-row">
          <Link
            href={workspace.home}
            className="brand"
            aria-label={`${project.name} home`}
            title={project.tagline}
          >
            <span className={`brand-mark accent-${project.accent}`}>
              {project.mark}
            </span>
            <strong>{project.name}</strong>
          </Link>
          <button
            className="icon-button brand-edit"
            type="button"
            onClick={() => setProjectEditorOpen(true)}
            aria-label={`Rename the ${workspace.label.toLowerCase()} workspace`}
            title="Rename this space"
          >
            <Pencil size={15} />
          </button>
          <button
            className="icon-button mobile-only"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>
        <nav className="nav-list">
          {workspace.modules.map(({ href, icon: Icon, label }) => (
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
        {/* Two workspaces, one control. A segmented switch rather than a menu
            because there are exactly two and the answer should be one click,
            visible without opening anything. */}
        <div
          className="workspace-switch"
          role="radiogroup"
          aria-label="Workspace"
        >
          {workspaces.map((item) => {
            const Icon = item.icon;
            const active = item.id === workspace.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={active ? "active" : ""}
                title={item.tagline}
                onClick={() => {
                  setMobileOpen(false);
                  if (active) return;
                  savePreferences({ ...preferences, workspace: item.id });
                  // Land on the new workspace's home rather than leaving the
                  // person on a module its navigation no longer lists.
                  router.push(item.home);
                }}
              >
                <Icon size={15} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
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
          {/* A button that looks like a field. The field itself lives in the
              overlay, so there is one search box rather than two that disagree. */}
          <button
            type="button"
            className="search-box"
            onClick={() => setSearchOpen(true)}
            aria-label="Search jarins"
            aria-haspopup="dialog"
          >
            <Search size={17} />
            <span>Search tasks, people, documents…</span>
            <kbd>⌘ S</kbd>
          </button>
          <div className="top-actions">
            {/* Quick capture lives here now: one icon, the shortcut in the
                tooltip, and no three-line block eating the sidebar. */}
            <button
              className="icon-button capture-button"
              type="button"
              onClick={openCapture}
              aria-label="Quick capture a task, note or reminder"
              title="Quick capture  ⌘K"
            >
              <Plus size={19} />
            </button>
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
                  <ProfileAvatar
                    url={avatarUrl}
                    initials={initials}
                    accent={accent}
                    size="sm"
                  />
                  <b>{displayName}</b>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                {accountMenuOpen && (
                  <div className="account-menu-panel" role="menu">
                    <div className="account-menu-identity">
                      <ProfileAvatar
                        url={avatarUrl}
                        initials={initials}
                        accent={accent}
                        size="md"
                      />
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
        {workspace.modules.slice(0, 3).map(({ href, icon: Icon, label }) => (
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
      <ProjectEditor
        key={`${workspace.id}-${projectEditorOpen}`}
        open={projectEditorOpen}
        workspace={workspace.id}
        project={project}
        onClose={() => setProjectEditorOpen(false)}
        onSave={(next) => {
          savePreferences({
            ...preferences,
            projects: withProject(preferences, workspace.id, next),
          });
          setProjectEditorOpen(false);
        }}
      />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
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
