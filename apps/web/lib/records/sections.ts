import type { LifeRecord } from "./schema";

/**
 * Which record kinds each subsection of a life area shows.
 *
 * Pure data, kept out of records-workspace.tsx so that module-view can compute
 * a section without pulling the whole editing workspace into its bundle — the
 * component is loaded lazily, and a static import of a helper beside it would
 * defeat that.
 */
export const subsectionKinds: Partial<
  Record<LifeRecord["module"], Record<string, string[]>>
> = {
  family: {
    calendar: ["Event"],
    routines: ["Routine"],
    clothing: ["Clothing"],
    documents: ["Child note"],
    memories: ["Memory"],
  },
  home: {
    meals: ["Meal"],
    groceries: ["Grocery"],
    routines: ["Routine"],
    maintenance: ["Maintenance", "Contract"],
  },
  self: {
    "check-in": ["Check-in"],
    routines: ["Routine"],
    "protected-time": ["Protected time"],
  },
  learning: {
    programs: ["Program"],
    sessions: ["Study session"],
    evidence: ["Certificate", "Evidence"],
  },
  career: {
    transition: ["Transition"],
    timeline: ["Timeline"],
    evidence: ["Evidence"],
    portfolio: ["Portfolio"],
    "job-readiness": ["Job readiness"],
  },
  money: {
    recurring: ["Monthly cost", "Annual cost", "Subscription"],
    goals: ["Savings goal"],
  },
  future: {
    goals: ["This month", "3 months", "12 months", "3 years", "Someday"],
    projects: ["Project"],
  },
  work: {
    focus: ["Focus"],
    deliverables: ["Deliverable"],
    deadlines: ["Deadline"],
    meetings: ["Meeting"],
    blocked: ["Blocker"],
  },
  pipeline: {
    opportunities: ["Opportunity"],
    applications: ["Application"],
    interviews: ["Interview", "Offer"],
    "follow-ups": ["Follow-up"],
  },
  portfolio: {
    "case-studies": ["Case study"],
    projects: ["Project"],
    evidence: ["Evidence", "Testimonial", "Publication"],
  },
  network: {
    contacts: ["Contact"],
    "follow-ups": ["Follow-up", "Introduction"],
    referrals: ["Referral"],
  },
};

export function recordsInSection(
  records: LifeRecord[],
  module: LifeRecord["module"],
  subsection?: string,
  today = new Date().toISOString().slice(0, 10),
) {
  const allowedKinds = subsection
    ? subsectionKinds[module]?.[subsection]
    : undefined;
  return records
    .filter((record) => record.module === module)
    .filter((record) => !allowedKinds || allowedKinds.includes(record.kind))
    .filter(
      (record) =>
        (subsection !== "upcoming" && subsection !== "expiring") ||
        Boolean(
          record.date && record.date >= today && record.status !== "done",
        ),
    );
}
