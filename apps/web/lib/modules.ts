import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Baby,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  Heart,
  Home,
  Inbox,
  Landmark,
  Search,
  Settings,
  Sparkles,
  SunMedium,
} from "lucide-react";

export type ModuleKey =
  | "today"
  | "family"
  | "home"
  | "self"
  | "learning"
  | "career"
  | "money"
  | "documents"
  | "future"
  | "inbox"
  | "calendar"
  | "vault"
  | "search"
  | "settings";

export type ModuleDefinition = {
  key: ModuleKey;
  label: string;
  href: string;
  icon: LucideIcon;
  eyebrow: string;
  description: string;
};

export const primaryModules: ModuleDefinition[] = [
  {
    key: "home",
    label: "Home",
    href: "/home",
    icon: Home,
    eyebrow: "Less mental load",
    description: "Meals, groceries, gentle routines and household maintenance.",
  },
  {
    key: "today",
    label: "Today",
    href: "/today",
    icon: SunMedium,
    eyebrow: "Your calm control surface",
    description: "See what matters now, what comes next, and what can wait.",
  },
  {
    key: "family",
    label: "Family",
    href: "/family",
    icon: Baby,
    eyebrow: "People before tasks",
    description:
      "Schedules, routines, clothing, documents and memories — together.",
  },
  {
    key: "self",
    label: "Self",
    href: "/self",
    icon: Heart,
    eyebrow: "You are part of the system",
    description:
      "Energy, reflection, minimum routines and protected recovery time.",
  },
  {
    key: "learning",
    label: "Learning",
    href: "/learning",
    icon: BookOpen,
    eyebrow: "Small blocks, real progress",
    description: "German B2, Digital Marketing and future learning programs.",
  },
  {
    key: "career",
    label: "Career",
    href: "/career",
    icon: BriefcaseBusiness,
    eyebrow: "Professional re-entry",
    description:
      "Build a coherent transition from evidence, learning and projects.",
  },
  {
    key: "money",
    label: "Money",
    href: "/money",
    icon: Landmark,
    eyebrow: "Clarity without obsession",
    description:
      "Plan recurring commitments, upcoming costs and savings goals.",
  },
  {
    key: "documents",
    label: "Documents",
    href: "/documents",
    icon: FileText,
    eyebrow: "Find anything in seconds",
    description: "A private, deadline-aware index for important records.",
  },
  {
    key: "future",
    label: "Future",
    href: "/future",
    icon: Sparkles,
    eyebrow: "Direction before speed",
    description: "Connect life horizons to one small action today.",
  },
];

export const utilityModules: ModuleDefinition[] = [
  {
    key: "inbox",
    label: "Inbox",
    href: "/inbox",
    icon: Inbox,
    eyebrow: "Captured, not forgotten",
    description: "Organize what you captured when you have the space.",
  },
  {
    key: "calendar",
    label: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    eyebrow: "The shape of your week",
    description: "Family events, appointments and protected time in one place.",
  },
  {
    key: "vault",
    label: "VAULT",
    href: "/vault",
    icon: Archive,
    eyebrow: "External files, within reach",
    description:
      "Find and use files across connected drives without storing them twice.",
  },
  {
    key: "search",
    label: "Search",
    href: "/search",
    icon: Search,
    eyebrow: "Find, don’t remember",
    description: "Search across tasks, people, documents and learning.",
  },
  {
    key: "settings",
    label: "Settings",
    href: "/settings",
    icon: Settings,
    eyebrow: "Make jarins yours",
    description:
      "Profile, household, notifications, privacy and data controls.",
  },
];

export const allModules = [...primaryModules, ...utilityModules];
export const findModule = (slug?: string) =>
  allModules.find((item) => item.key === slug) ??
  primaryModules.find((item) => item.key === "today")!;

/** Routes that exist but are not life-area modules. */
export const standaloneRoutes = ["auth", "onboarding", "reset"] as const;

/**
 * The signed-out screens. They live under /auth so one prefix covers all of
 * them — the middleware allowlist, the Supabase redirect allowlist and the CSP
 * exemptions each name a single path instead of drifting out of sync with a
 * list of five. It also keeps /reset (the weekly reset, a life-area feature)
 * from reading as a sibling of /auth/reset-password.
 *
 * `callback` is served by app/auth/callback/route.ts, which matches ahead of
 * the catch-all, so it never reaches ModuleView — it is listed here only so
 * that the route is recognised rather than 404'd.
 */
export const authRoutes = [
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "invite",
  "callback",
] as const;

/**
 * Whether a path resolves to a real screen. Checked on the server so an unknown
 * URL answers 404 rather than a 200 carrying the not-found body.
 *
 * Takes the whole slug rather than its first segment: /auth is not a screen on
 * its own, so /auth/nonsense has to 404 like any other unknown route instead of
 * rendering an empty shell.
 */
export const isKnownRoute = (slug: readonly string[] = []) => {
  const [root, screen] = slug;
  if (!root) return true;
  if (root === "auth")
    return (authRoutes as readonly string[]).includes(screen);
  return (
    allModules.some((item) => item.key === root) ||
    (standaloneRoutes as readonly string[]).includes(root)
  );
};
