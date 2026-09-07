import { moduleLabels, type LifeRecord } from "./records/schema";

export const searchCategories = [
  { id: "tasks", label: "Tasks" },
  { id: "documents", label: "Documents" },
  { id: "people", label: "People" },
  { id: "teams", label: "Teams" },
  { id: "threads", label: "Threads" },
  { id: "files", label: "Files" },
] as const;

export type SearchCategory = (typeof searchCategories)[number]["id"];

export type SearchHit = {
  id: string;
  category: SearchCategory;
  title: string;
  /** Where it lives, in the words the person would use. */
  subtitle: string;
  href: string;
};

/**
 * Everything is searched at once and labelled by where it came from, rather
 * than scoped to the workspace you happen to be in. The two workspaces exist to
 * keep attention in one place, not to hide your own data from you — and a
 * search you have to run twice is a search that has failed.
 */
export function matches(haystack: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  const text = haystack.toLowerCase();
  // Every word has to appear, so "kita bag" finds "Kita: spare bag" and a
  // stray "bag" elsewhere does not drown it.
  return needle.split(/\s+/).every((word) => text.includes(word));
}

export function recordHits(
  records: readonly LifeRecord[],
  query: string,
): SearchHit[] {
  if (!query.trim()) return [];
  return records
    .filter((record) =>
      matches(
        `${record.title} ${record.detail} ${record.kind} ${record.module}`,
        query,
      ),
    )
    .map((record) => ({
      id: record.id,
      // Documents are their own answer to "where did I put that", so they get
      // their own tab rather than sitting among the tasks.
      category: (record.module === "documents"
        ? "documents"
        : "tasks") as SearchCategory,
      title: record.title,
      subtitle: `${record.kind} · ${moduleLabels[record.module] ?? record.module}`,
      href: `/${record.module}`,
    }));
}

export function personHits(
  people: readonly { id: string; name: string; detail?: string }[],
  query: string,
): SearchHit[] {
  if (!query.trim()) return [];
  return people
    .filter((person) => matches(`${person.name} ${person.detail ?? ""}`, query))
    .map((person) => ({
      id: person.id,
      category: "people" as const,
      title: person.name,
      subtitle: person.detail || "Household member",
      href: "/family",
    }));
}

export function teamHits(
  teams: readonly { id: string; name: string; memberCount: number }[],
  query: string,
): SearchHit[] {
  if (!query.trim()) return [];
  return teams
    .filter((team) => matches(team.name, query))
    .map((team) => ({
      id: team.id,
      category: "teams" as const,
      title: team.name,
      subtitle: `${team.memberCount} member${team.memberCount === 1 ? "" : "s"}`,
      href: "/teams",
    }));
}

export function threadHits(
  threads: readonly { id: string; title: string; workspace: string }[],
  query: string,
): SearchHit[] {
  if (!query.trim()) return [];
  return threads
    .filter((thread) => matches(thread.title, query))
    .map((thread) => ({
      id: thread.id,
      category: "threads" as const,
      title: thread.title,
      subtitle:
        thread.workspace === "professional"
          ? "Professional conversation"
          : "Personal conversation",
      href: "/today",
    }));
}

export function fileHits(
  files: readonly { id: string; name: string; accountLabel?: string }[],
  query: string,
): SearchHit[] {
  if (!query.trim()) return [];
  return files
    .filter((file) => matches(file.name, query))
    .map((file) => ({
      id: file.id,
      category: "files" as const,
      title: file.name,
      subtitle: file.accountLabel || "Connected drive",
      href: "/vault",
    }));
}

/** Hits per category, in the order the tabs are shown. */
export function countByCategory(hits: readonly SearchHit[]) {
  const counts = Object.fromEntries(
    searchCategories.map((category) => [category.id, 0]),
  ) as Record<SearchCategory, number>;
  for (const hit of hits) counts[hit.category] += 1;
  return counts;
}
