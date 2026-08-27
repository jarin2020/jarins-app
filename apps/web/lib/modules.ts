import type { LucideIcon } from "lucide-react";
import { Baby, BookOpen, BriefcaseBusiness, CalendarDays, FileText, Heart, Home, Inbox, Landmark, Search, Settings, Sparkles, SunMedium } from "lucide-react";

export type ModuleKey = "today" | "family" | "home" | "self" | "learning" | "career" | "money" | "documents" | "future" | "inbox" | "calendar" | "search" | "settings";

export type ModuleDefinition = { key: ModuleKey; label: string; href: string; icon: LucideIcon; eyebrow: string; description: string };

export const primaryModules: ModuleDefinition[] = [
  { key: "today", label: "Today", href: "/today", icon: SunMedium, eyebrow: "Your calm control surface", description: "See what matters now, what comes next, and what can wait." },
  { key: "family", label: "Family", href: "/family", icon: Baby, eyebrow: "People before tasks", description: "Schedules, routines, clothing, documents and memories — together." },
  { key: "home", label: "Home", href: "/home", icon: Home, eyebrow: "Less mental load", description: "Meals, groceries, gentle routines and household maintenance." },
  { key: "self", label: "Self", href: "/self", icon: Heart, eyebrow: "You are part of the system", description: "Energy, reflection, minimum routines and protected recovery time." },
  { key: "learning", label: "Learning", href: "/learning", icon: BookOpen, eyebrow: "Small blocks, real progress", description: "German B2, Digital Marketing and future learning programs." },
  { key: "career", label: "Career", href: "/career", icon: BriefcaseBusiness, eyebrow: "Professional re-entry", description: "Build a coherent transition from evidence, learning and projects." },
  { key: "money", label: "Money", href: "/money", icon: Landmark, eyebrow: "Clarity without obsession", description: "Plan recurring commitments, upcoming costs and savings goals." },
  { key: "documents", label: "Documents", href: "/documents", icon: FileText, eyebrow: "Find anything in seconds", description: "A private, deadline-aware index for important records." },
  { key: "future", label: "Future", href: "/future", icon: Sparkles, eyebrow: "Direction before speed", description: "Connect life horizons to one small action today." },
];

export const utilityModules: ModuleDefinition[] = [
  { key: "inbox", label: "Inbox", href: "/inbox", icon: Inbox, eyebrow: "Captured, not forgotten", description: "Organize what you captured when you have the space." },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: CalendarDays, eyebrow: "The shape of your week", description: "Family events, appointments and protected time in one place." },
  { key: "search", label: "Search", href: "/search", icon: Search, eyebrow: "Find, don’t remember", description: "Search across tasks, people, documents and learning." },
  { key: "settings", label: "Settings", href: "/settings", icon: Settings, eyebrow: "Make jarins yours", description: "Profile, household, notifications, privacy and data controls." },
];

export const allModules = [...primaryModules, ...utilityModules];
export const findModule = (slug?: string) => allModules.find((item) => item.key === slug) ?? primaryModules[0];
