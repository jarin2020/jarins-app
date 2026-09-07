import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Baby,
  CircleUser,
  BriefcaseBusiness as BriefcaseIcon,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  Heart,
  Home,
  Inbox,
  Landmark,
  Contact,
  FolderKanban,
  Route,
  Search,
  Settings,
  Sparkles,
  SunMedium,
  Target,
  UsersRound,
} from "lucide-react";

export type ModuleKey =
  | "today"
  | "work"
  | "pipeline"
  | "portfolio"
  | "network"
  | "teams"
  | "my-work"
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

/**
 * The professional side of the app. Separate definitions rather than a flag on
 * the personal ones: these are different life areas with their own language,
 * and a "Family" entry has no business in a workspace about work.
 */
export const professionalModules: ModuleDefinition[] = [
  {
    // The route and the record module stay `work` — every existing record is
    // filed under it, and renaming those means a migration for a label. What
    // the person reads is "Dashboard", which is what the screen actually is.
    key: "work",
    label: "Dashboard",
    href: "/work",
    icon: Target,
    eyebrow: "The shape of the work",
    description:
      "What is due, what is moving, what is stuck — and the next move on an opportunity.",
  },
  {
    // A view, not a store: everything here is a life record that already
    // belongs to a module. What makes it "mine" is being assigned to me or
    // written by me, which is a question about rows rather than about tables.
    key: "my-work",
    label: "My work",
    href: "/my-work",
    icon: CircleUser,
    eyebrow: "Only what is yours",
    description:
      "What has been assigned to you and what you set yourself, across every team.",
  },
  {
    key: "teams",
    label: "Teams",
    href: "/teams",
    icon: UsersRound,
    eyebrow: "People, and who does what",
    description:
      "Who is in each team, what their role is, and what has been assigned to whom.",
  },
  {
    key: "pipeline",
    label: "Pipeline",
    href: "/pipeline",
    icon: Route,
    eyebrow: "Opportunity, not anxiety",
    description:
      "Roles, applications and interviews, with the next step always visible.",
  },
  {
    key: "network",
    label: "Network",
    href: "/network",
    icon: Contact,
    eyebrow: "People, kept warm",
    description: "Contacts, introductions and the follow-ups that go stale.",
  },
  {
    key: "career",
    label: "Career",
    href: "/career",
    icon: BriefcaseIcon,
    eyebrow: "The shape of a working life",
    description:
      "Timeline, transition and the narrative that ties the two together.",
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
    key: "portfolio",
    label: "Portfolio",
    href: "/portfolio",
    icon: FolderKanban,
    eyebrow: "Evidence beats claims",
    description:
      "Case studies, projects and proof you can hand to someone who asks.",
  },
];

export const allModules = [
  ...primaryModules,
  ...utilityModules,
  ...professionalModules.filter(
    (item) => !primaryModules.some((existing) => existing.key === item.key),
  ),
];

/**
 * Which modules each workspace shows, and where it opens.
 *
 * Personal is the default and keeps every module it had. Professional reuses
 * Career, Learning and Documents — the same records, read in a working context
 * — and adds four of its own. The utility rail is shared: Inbox, Calendar,
 * VAULT and Search work the same either side of the line.
 */
export const workspaces = [
  {
    id: "personal" as const,
    label: "Personal",
    tagline: "Home, family and you",
    icon: Home,
    home: "/today",
    modules: primaryModules,
    utility: utilityModules.slice(0, 3),
  },
  {
    id: "professional" as const,
    label: "Professional",
    tagline: "Work, craft and career",
    icon: BriefcaseIcon,
    home: "/work",
    modules: professionalModules,
    // Learning sits below the divider at work: it is something you do around
    // the job rather than a part of it, and it kept crowding the areas the day
    // is actually organised by.
    utility: [
      primaryModules.find((item) => item.key === "learning")!,
      ...utilityModules.slice(0, 3),
    ],
  },
];

export type WorkspaceDefinition = (typeof workspaces)[number];

export const findWorkspace = (id?: string) =>
  workspaces.find((workspace) => workspace.id === id) ?? workspaces[0];

/** Which workspace a module belongs to, for the modules unique to one side. */
export const workspaceForModule = (key: string) => {
  if (professionalModules.some((item) => item.key === key))
    return primaryModules.some((item) => item.key === key)
      ? undefined // shared: it belongs to whichever workspace you are in
      : ("professional" as const);
  return primaryModules.some((item) => item.key === key)
    ? ("personal" as const)
    : undefined;
};
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
