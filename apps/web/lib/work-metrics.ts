import type { LifeRecord, RecordStatus } from "./records/schema";

/**
 * The numbers the dashboard draws.
 *
 * Pure, and separate from the charts, because the interesting part is the
 * counting — which day a record belongs to, what happens to one with no date,
 * whether "done" still counts as overdue — and none of that should only be
 * checkable by rendering an SVG.
 */

export const statusOrder: RecordStatus[] = [
  "open",
  "in-progress",
  "paused",
  "done",
];

export const statusLabels: Record<RecordStatus, string> = {
  open: "Open",
  "in-progress": "In progress",
  paused: "Paused",
  done: "Done",
};

export function statusBreakdown(records: readonly LifeRecord[]) {
  const counts = Object.fromEntries(
    statusOrder.map((status) => [status, 0]),
  ) as Record<RecordStatus, number>;
  for (const record of records) counts[record.status] += 1;
  const total = records.length;
  return statusOrder.map((status) => ({
    status,
    label: statusLabels[status],
    count: counts[status],
    // Of the whole, not of the largest bar: this reads as "how much of my work
    // is stuck", which a relative scale would flatter.
    share: total ? counts[status] / total : 0,
  }));
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * How much lands on each of the next `days` days. Finished work is left out —
 * a column of things already done says nothing about what is coming.
 */
export function dueByDay(
  records: readonly LifeRecord[],
  today: string,
  days = 14,
) {
  // The client does not know what day it is during server rendering, and a
  // window built from a blank date is a row of Invalid Dates that throws the
  // moment anything formats one. An empty window is the honest answer.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
  const window = Array.from({ length: days }, (_, index) =>
    addDays(today, index),
  );
  const counts = new Map(window.map((day) => [day, 0]));
  for (const record of records) {
    if (record.status === "done" || !record.date) continue;
    const day = record.date;
    if (counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return window.map((day) => ({
    day,
    count: counts.get(day) ?? 0,
    isToday: day === today,
  }));
}

/** Anything unfinished whose date has already passed. */
export function overdueCount(records: readonly LifeRecord[], today: string) {
  return records.filter(
    (record) => record.status !== "done" && record.date && record.date < today,
  ).length;
}

/**
 * The pipeline as stages rather than a list. Ordered by how far along the
 * conversation is, so the shape of the funnel means something.
 */
export const pipelineStages = [
  "Opportunity",
  "Application",
  "Interview",
  "Offer",
] as const;

export function pipelineFunnel(records: readonly LifeRecord[]) {
  const open = records.filter((record) => record.status !== "done");
  const counts = pipelineStages.map((stage) => ({
    stage,
    count: open.filter((record) => record.kind === stage).length,
  }));
  const widest = Math.max(1, ...counts.map((entry) => entry.count));
  return counts.map((entry) => ({ ...entry, share: entry.count / widest }));
}

/** Who is carrying what, for work that belongs to a team. */
export function workloadByAssignee(
  records: readonly (LifeRecord & { assigneeUserId?: string | null })[],
  names: ReadonlyMap<string, string>,
) {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.status === "done") continue;
    const key = record.assigneeUserId ?? "";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const widest = Math.max(1, ...counts.values());
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      name: id ? (names.get(id) ?? "Someone") : "Unassigned",
      count,
      share: count / widest,
    }))
    .sort((a, b) => b.count - a.count);
}
