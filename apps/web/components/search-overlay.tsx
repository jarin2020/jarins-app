"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Baby,
  FileText,
  Folder,
  MessagesSquare,
  Search,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useAuth } from "./auth-provider";
import { useLifeRecords } from "@/lib/jarins-store";
import {
  countByCategory,
  fileHits,
  personHits,
  recordHits,
  searchCategories,
  teamHits,
  threadHits,
  type SearchCategory,
  type SearchHit,
} from "@/lib/search";

const icons: Record<SearchCategory, typeof Search> = {
  tasks: Baby,
  documents: FileText,
  people: UserRound,
  teams: UsersRound,
  threads: MessagesSquare,
  files: Folder,
};

type Directory = {
  people: { id: string; name: string; detail?: string }[];
  teams: { id: string; name: string; memberCount: number }[];
  threads: { id: string; title: string; workspace: string }[];
};

const emptyDirectory: Directory = { people: [], teams: [], threads: [] };

/**
 * Search as a place rather than a page.
 *
 * The old search box submitted to /search, which meant leaving whatever you
 * were doing to look something up. This opens over the top and closes again,
 * and it looks in every category at once — you should not have to know whether
 * the thing you half-remember was a document, a person or a conversation.
 */
export function SearchOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { supabase, user, householdId, status } = useAuth();
  const { records } = useLifeRecords();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchCategory | "all">("all");
  const [directory, setDirectory] = useState<Directory>(emptyDirectory);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      // Selected, not just focused: the previous query stays visible as a
      // reminder of what you last looked for, and typing replaces it rather
      // than appending to it.
      input.current?.focus();
      input.current?.select();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  // `cancel` and `close` do not bubble, so React's onClose never fires for
  // them. Listening on the element itself is what actually works.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const handleClose = () => close.current();
    element.addEventListener("close", handleClose);
    return () => element.removeEventListener("close", handleClose);
  }, []);

  // People, teams and conversations are not in the record store, so they are
  // fetched once when the overlay opens rather than on every keystroke.
  useEffect(() => {
    if (!open || !supabase || status !== "signed-in" || !householdId) return;
    let active = true;
    void Promise.all([
      supabase.rpc("list_household_users"),
      supabase
        .from("message_teams")
        .select("id,name,message_team_members(user_id)"),
      supabase.from("message_threads").select("id,title,workspace"),
    ]).then(([people, teams, threads]) => {
      if (!active) return;
      setDirectory({
        people: (
          (people.data ?? []) as {
            user_id: string;
            display_name: string;
            email: string;
          }[]
        ).map((row) => ({
          id: row.user_id,
          name: row.display_name,
          detail: row.email,
        })),
        teams: (
          (teams.data ?? []) as {
            id: string;
            name: string;
            message_team_members: { user_id: string }[] | null;
          }[]
        ).map((row) => ({
          id: row.id,
          name: row.name,
          memberCount: (row.message_team_members ?? []).length,
        })),
        threads: (
          (threads.data ?? []) as {
            id: string;
            title: string;
            workspace: string;
          }[]
        ).map((row) => ({
          id: row.id,
          title: row.title,
          workspace: row.workspace,
        })),
      });
    });
    return () => {
      active = false;
    };
  }, [open, supabase, status, householdId, user?.id]);

  const hits = useMemo<SearchHit[]>(
    () => [
      ...recordHits(records, query),
      ...personHits(directory.people, query),
      ...teamHits(directory.teams, query),
      ...threadHits(directory.threads, query),
      ...fileHits([], query),
    ],
    [records, directory, query],
  );
  const counts = useMemo(() => countByCategory(hits), [hits]);
  const shown =
    tab === "all" ? hits : hits.filter((hit) => hit.category === tab);

  return (
    <dialog
      ref={dialog}
      className="modal-dialog search-dialog"
      aria-labelledby="search-title"
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="search-overlay">
        <header>
          <Search size={19} />
          <input
            ref={input}
            id="global-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks, people, documents…"
            aria-label="Search jarins"
          />
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close search"
          >
            <X size={18} />
          </button>
        </header>
        <h2 id="search-title" className="visually-hidden">
          Search
        </h2>

        <nav className="search-tabs" aria-label="Result categories">
          <button
            type="button"
            className={tab === "all" ? "active" : ""}
            onClick={() => setTab("all")}
          >
            All <small>{hits.length}</small>
          </button>
          {searchCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={tab === category.id ? "active" : ""}
              disabled={counts[category.id] === 0}
              onClick={() => setTab(category.id)}
            >
              {category.label} <small>{counts[category.id]}</small>
            </button>
          ))}
        </nav>

        <div className="search-results">
          {!query.trim() ? (
            <p className="muted">
              Start typing. Everything is searched at once — tasks, documents,
              people, teams and conversations.
            </p>
          ) : shown.length === 0 ? (
            <p className="muted">Nothing matches “{query.trim()}”.</p>
          ) : (
            shown.map((hit) => {
              const Icon = icons[hit.category];
              return (
                <Link
                  key={`${hit.category}-${hit.id}`}
                  href={hit.href}
                  className="search-result"
                  onClick={onClose}
                >
                  <span className="search-result-icon">
                    <Icon size={15} />
                  </span>
                  <div>
                    <strong>{hit.title}</strong>
                    <p>{hit.subtitle}</p>
                  </div>
                  <span className="search-result-open">
                    Open <ArrowRight size={14} />
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </dialog>
  );
}
