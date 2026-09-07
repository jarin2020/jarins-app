import { describe, expect, it } from "vitest";
import type { LifeRecord } from "./records/schema";
import {
  dueByDay,
  overdueCount,
  pipelineFunnel,
  statusBreakdown,
  workloadByAssignee,
} from "./work-metrics";

// `assigneeUserId` is not on LifeRecord — it comes from the team workspace's
// wider row — so the helper accepts it alongside.
const rec = (
  over: Partial<LifeRecord> & { assigneeUserId?: string | null },
): LifeRecord & { assigneeUserId?: string | null } => ({
  id: Math.random().toString(36),
  module: "work",
  kind: "Deliverable",
  title: "Something",
  detail: "",
  status: "open",
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("work metrics", () => {
  it("shares out of the whole, not out of the biggest bar", () => {
    const bars = statusBreakdown([
      rec({ status: "open" }),
      rec({ status: "open" }),
      rec({ status: "done" }),
      rec({ status: "paused" }),
    ]);
    expect(bars.find((b) => b.status === "open")).toMatchObject({
      count: 2,
      share: 0.5,
    });
    // A relative scale would show "paused" as half the height of "open" and
    // flatter a backlog that is a quarter stuck.
    expect(bars.find((b) => b.status === "paused")?.share).toBe(0.25);
  });

  it("names every status even when nothing has it", () => {
    const bars = statusBreakdown([]);
    expect(bars).toHaveLength(4);
    expect(bars.every((bar) => bar.count === 0 && bar.share === 0)).toBe(true);
  });

  it("counts what lands on each of the next days, and only that", () => {
    const days = dueByDay(
      [
        rec({ date: "2026-09-07" }),
        rec({ date: "2026-09-07" }),
        rec({ date: "2026-09-09" }),
        rec({ date: "2026-09-09", status: "done" }), // finished: not coming
        rec({ date: "2026-08-01" }), // before the window
        rec({ date: "2027-01-01" }), // after it
        rec({}), // no date at all
      ],
      "2026-09-07",
      3,
    );
    expect(days.map((d) => d.count)).toEqual([2, 0, 1]);
    expect(days[0]).toMatchObject({ day: "2026-09-07", isToday: true });
    expect(days[2].isToday).toBe(false);
  });

  it("crosses a month boundary rather than counting to 32", () => {
    const days = dueByDay([rec({ date: "2026-10-01" })], "2026-09-30", 3);
    expect(days.map((d) => d.day)).toEqual([
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(days[1].count).toBe(1);
  });

  it("counts overdue as unfinished and past, not merely past", () => {
    const records = [
      rec({ date: "2026-09-01" }),
      rec({ date: "2026-09-01", status: "done" }),
      rec({ date: "2026-09-07" }),
    ];
    expect(overdueCount(records, "2026-09-07")).toBe(1);
  });

  it("keeps the pipeline in stage order and scales to the widest", () => {
    const funnel = pipelineFunnel([
      rec({ module: "pipeline", kind: "Opportunity" }),
      rec({ module: "pipeline", kind: "Opportunity" }),
      rec({ module: "pipeline", kind: "Interview" }),
      rec({ module: "pipeline", kind: "Offer", status: "done" }),
    ]);
    expect(funnel.map((f) => f.stage)).toEqual([
      "Opportunity",
      "Application",
      "Interview",
      "Offer",
    ]);
    expect(funnel[0]).toMatchObject({ count: 2, share: 1 });
    expect(funnel[2].share).toBe(0.5);
    expect(funnel[3].count).toBe(0);
  });

  it("groups workload by person and puts the unassigned in their own row", () => {
    const rows = workloadByAssignee(
      [
        rec({ assigneeUserId: "a" }),
        rec({ assigneeUserId: "a" }),
        rec({ assigneeUserId: "b" }),
        rec({ assigneeUserId: null }),
        rec({ assigneeUserId: "a", status: "done" }),
      ],
      new Map([
        ["a", "Faria"],
        ["b", "Zaman"],
      ]),
    );
    expect(rows[0]).toMatchObject({ name: "Faria", count: 2, share: 1 });
    expect(rows.map((r) => r.name)).toContain("Unassigned");
    expect(rows.find((r) => r.name === "Unassigned")?.count).toBe(1);
  });

  it("returns an empty window rather than a broken one before the date is known", () => {
    // The client does not know today during server rendering. An empty array is
    // the correct answer; formatting a blank date throws RangeError and takes
    // the page down with "Invalid time value".
    expect(dueByDay([rec({ date: "2026-09-07" })], "", 14)).toEqual([]);
  });
});
