"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Command, Menu, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { primaryModules, utilityModules } from "@/lib/modules";
import { QuickCapture } from "./quick-capture";
import { usePreferences } from "@/lib/preferences-store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { preferences } = usePreferences();
  const initials = preferences.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "J";

  const openCapture = useCallback(() => setCaptureOpen(true), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCapture();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openCapture]);

  const navigateSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (search.trim()) router.push(`/search?q=${encodeURIComponent(search.trim())}`);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`} aria-label="Primary navigation">
        <div className="brand-row">
          <Link href="/today" className="brand" aria-label="jarins home"><span className="brand-mark">j.</span><span><strong>jarins</strong><small>Life OS</small></span></Link>
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={19} /></button>
        </div>
        <nav className="nav-list">
          {primaryModules.map(({ href, icon: Icon, label }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={pathname.startsWith(href) ? "active" : ""}><Icon size={18} /><span>{label}</span></Link>)}
        </nav>
        <div className="nav-divider" />
        <nav className="nav-list nav-utility">
          {utilityModules.slice(0, 2).map(({ href, icon: Icon, label }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={pathname.startsWith(href) ? "active" : ""}><Icon size={18} /><span>{label}</span></Link>)}
        </nav>
        <div className="family-mini"><div className="avatar-stack"><span>{initials}</span><span>A</span><span>B</span></div><strong>{preferences.household}</strong><small>Local-first · private by design</small></div>
      </aside>

      {mobileOpen && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}

      <main className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <form className="search-box" onSubmit={navigateSearch} role="search"><Search size={17} /><input id="global-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, people, documents…" aria-label="Search jarins" /><kbd>⌘ /</kbd></form>
          <div className="top-actions"><Link href="/calendar" className="icon-button" aria-label="Upcoming reminders"><Bell size={18} /></Link><Link href="/settings/profile" className="profile-chip"><span>{initials}</span><b>{preferences.name}</b></Link></div>
        </header>
        <div className="page-content">{children}</div>
      </main>

      <button className="capture-fab" onClick={openCapture} aria-label="Quick capture"><Plus size={19} /><span>Quick capture</span><kbd><Command size={12} />K</kbd></button>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {primaryModules.filter((item) => ["today", "family", "future"].includes(item.key)).map(({ href, icon: Icon, label }) => <Link key={href} href={href} className={pathname.startsWith(href) ? "active" : ""}><Icon size={20} /><span>{label}</span></Link>)}
        <button className="mobile-capture" onClick={openCapture}><Plus size={22} /><span>Capture</span></button>
        <button onClick={() => setMobileOpen(true)}><Menu size={20} /><span>More</span></button>
      </nav>
      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </div>
  );
}
