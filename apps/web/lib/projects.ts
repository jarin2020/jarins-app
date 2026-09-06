import {
  isProfileAccent,
  profileAccents,
  type ProfileAccent,
} from "./account-profile";
import type { WorkspaceId } from "./records/schema";

/**
 * What the sidebar calls this space.
 *
 * Each workspace carries its own, because they are two different things to
 * name: a household is not a career. The mark and accent travel with the name
 * so that a glance at the corner tells you which one you are in — the switch at
 * the foot of the sidebar says it too, but the brand is what the eye lands on
 * first.
 */
export type ProjectIdentity = {
  name: string;
  tagline: string;
  /** One or two characters, or an emoji, drawn in the brand tile. */
  mark: string;
  accent: ProfileAccent;
};

export const projectLimits = { name: 40, tagline: 40, mark: 4 } as const;

export const projectDefaults: Record<WorkspaceId, ProjectIdentity> = {
  personal: { name: "jarins", tagline: "Life OS", mark: "j.", accent: "green" },
  professional: {
    name: "jarins",
    tagline: "Professional",
    mark: "j.",
    // A different accent by default, so the two workspaces are told apart
    // before either name is read.
    accent: "slate",
  },
};

export const projectAccents = profileAccents;

function text(value: unknown, max: number, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : fallback;
}

/**
 * Reads one workspace's identity out of stored preferences.
 *
 * Field by field rather than all-or-nothing: preferences are a single
 * localStorage blob, and a half-written or hand-edited `projects` object should
 * cost you the field it broke, not your whole sidebar.
 */
export function resolveProject(
  // `unknown` on purpose: this reads a localStorage blob field by field, so
  // demanding a complete, well-typed record here would be a promise the input
  // cannot keep.
  preferences: { projects?: unknown } | undefined,
  workspace: WorkspaceId,
): ProjectIdentity {
  const fallback = projectDefaults[workspace];
  const projects = preferences?.projects;
  if (!projects || typeof projects !== "object") return fallback;
  const stored = (projects as Record<string, unknown>)[workspace] as
    Partial<ProjectIdentity> | undefined;
  if (!stored || typeof stored !== "object") return fallback;
  return {
    name: text(stored.name, projectLimits.name, fallback.name),
    tagline: text(stored.tagline, projectLimits.tagline, fallback.tagline),
    mark: text(stored.mark, projectLimits.mark, fallback.mark),
    accent: isProfileAccent(stored.accent) ? stored.accent : fallback.accent,
  };
}

/** Every workspace's identity, with the one being edited replaced. */
export function withProject(
  preferences: { projects?: unknown } | undefined,
  workspace: WorkspaceId,
  next: ProjectIdentity,
): Record<WorkspaceId, ProjectIdentity> {
  return {
    personal: resolveProject(preferences, "personal"),
    professional: resolveProject(preferences, "professional"),
    [workspace]: {
      name: text(
        next.name,
        projectLimits.name,
        projectDefaults[workspace].name,
      ),
      tagline: text(
        next.tagline,
        projectLimits.tagline,
        projectDefaults[workspace].tagline,
      ),
      mark: text(
        next.mark,
        projectLimits.mark,
        projectDefaults[workspace].mark,
      ),
      accent: isProfileAccent(next.accent)
        ? next.accent
        : projectDefaults[workspace].accent,
    },
  };
}

/** A mark the person did not choose: their name's initial, then the default. */
export function suggestMark(name: string, workspace: WorkspaceId) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
  return initials ? initials.toLowerCase() : projectDefaults[workspace].mark;
}
