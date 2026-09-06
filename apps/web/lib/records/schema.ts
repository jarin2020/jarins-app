import { z } from "zod";

export const RECORD_MODULES = [
  // Personal
  "family",
  "home",
  "self",
  "learning",
  "career",
  "money",
  "documents",
  "future",
  // Professional. Kept in one list because a record is a record — the split
  // is a matter of navigation, and search, export and the inbox all read
  // across both.
  "work",
  "pipeline",
  "portfolio",
  "network",
] as const;

export const RECORD_STATUSES = [
  "open",
  "in-progress",
  "done",
  "paused",
] as const;

export type RecordModule = (typeof RECORD_MODULES)[number];
export type RecordStatus = (typeof RECORD_STATUSES)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

/**
 * Ids and timestamps are validated as non-empty strings rather than as UUIDs
 * and datetimes: records created before the Supabase migration use slugs like
 * "family-kita" and plain dates. The cloud repository narrows both.
 */
export const lifeRecordSchema = z.object({
  id: z.string().min(1),
  module: z.enum(RECORD_MODULES),
  kind: z.string().min(1).max(60),
  title: z.string().min(1).max(200),
  detail: z.string().max(4000),
  date: isoDate.optional(),
  status: z.enum(RECORD_STATUSES),
  amount: z.number().nonnegative().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  essential: z.boolean().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type LifeRecord = z.infer<typeof lifeRecordSchema>;
export type NewLifeRecord = Omit<LifeRecord, "id" | "createdAt" | "updatedAt">;

export const capturedItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(2000),
  category: z.string().min(1).max(40),
  kind: z.enum(["Task", "Note"]).optional(),
  createdAt: z.string().min(1),
  status: z.enum(["inbox", "processed"]),
});

export type CapturedItem = z.infer<typeof capturedItemSchema>;

export const WORKSPACES = ["personal", "professional"] as const;
export type WorkspaceId = (typeof WORKSPACES)[number];

export const preferencesSchema = z.object({
  name: z.string().max(80),
  workspace: z.enum(WORKSPACES),
  // What each workspace is called in the sidebar. Optional because every read
  // path resolves it field by field against defaults (lib/projects.ts), so a
  // preferences blob written before this existed still opens.
  projects: z
    .record(
      z.enum(WORKSPACES),
      z.object({
        name: z.string().max(40),
        tagline: z.string().max(40),
        mark: z.string().max(4),
        accent: z.string().max(20),
      }),
    )
    .optional(),
  timezone: z.string().max(60),
  locale: z.enum(["en", "de"]),
  household: z.string().max(80),
  reminders: z.boolean(),
  minimalAnalytics: z.boolean(),
  aiFeatures: z.boolean(),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const weeklyResetSchema = z.object({
  current: z.number().int().min(0).max(50),
  complete: z.array(z.number().int().min(0).max(50)),
  notes: z.record(z.string(), z.string().max(10000)),
  updatedAt: z.string().min(1).optional(),
});

/** The shape written by Settings → Data → Export JSON. */
export const backupSchema = z.object({
  exportedAt: z.string().min(1).optional(),
  lifeRecords: z.array(lifeRecordSchema),
  inbox: z.array(capturedItemSchema).optional(),
  preferences: preferencesSchema.partial().optional(),
  weeklyReset: weeklyResetSchema.nullish(),
});

export type Backup = z.infer<typeof backupSchema>;

export const moduleLabels: Record<RecordModule, string> = {
  family: "Family",
  home: "Home",
  self: "Self",
  learning: "Learning",
  career: "Career",
  money: "Money",
  documents: "Documents",
  future: "Future",
  work: "Work",
  pipeline: "Pipeline",
  portfolio: "Portfolio",
  network: "Network",
};

export const kindOptions: Record<RecordModule, string[]> = {
  family: [
    "Event",
    "Routine",
    "Child note",
    "Clothing",
    "Packing list",
    "Memory",
    "Task",
  ],
  home: ["Meal", "Grocery", "Routine", "Maintenance", "Contract", "Task"],
  self: ["Check-in", "Protected time", "Routine", "Reflection", "Task"],
  learning: ["Program", "Study session", "Certificate", "Evidence", "Task"],
  career: [
    "Transition",
    "Timeline",
    "Evidence",
    "Portfolio",
    "Job readiness",
    "Task",
  ],
  money: [
    "Monthly cost",
    "Annual cost",
    "One-off cost",
    "Subscription",
    "Savings goal",
    "Education cost",
    "Task",
  ],
  documents: [
    "Identity",
    "Family",
    "Certificate",
    "Insurance",
    "Finance",
    "Home",
    "Medical admin",
    "Other",
    "Task",
  ],
  future: [
    "This month",
    "3 months",
    "12 months",
    "3 years",
    "Someday",
    "Project",
    "Task",
  ],
  work: ["Focus", "Deliverable", "Deadline", "Meeting", "Blocker", "Task"],
  pipeline: [
    "Opportunity",
    "Application",
    "Interview",
    "Offer",
    "Follow-up",
    "Task",
  ],
  portfolio: [
    "Case study",
    "Project",
    "Evidence",
    "Testimonial",
    "Publication",
    "Task",
  ],
  network: [
    "Contact",
    "Introduction",
    "Follow-up",
    "Referral",
    "Event",
    "Task",
  ],
};
