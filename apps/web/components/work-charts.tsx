"use client";

import type { RecordStatus } from "@/lib/records/schema";
import {
  pipelineStages,
  statusLabels,
  type statusBreakdown,
} from "@/lib/work-metrics";

/**
 * Hand-drawn SVG rather than a charting library.
 *
 * Three small charts do not justify the dependency or the bundle, and these
 * need to take their colours from the same tokens as the rest of the app —
 * which is the thing chart libraries are least willing to do. Each carries a
 * text summary for anyone who is not looking at it.
 */

const statusTone: Record<RecordStatus, string> = {
  open: "var(--career)",
  "in-progress": "var(--primary)",
  paused: "var(--warm)",
  done: "var(--family)",
};

export function StatusChart({
  bars,
}: {
  bars: ReturnType<typeof statusBreakdown>;
}) {
  const total = bars.reduce((sum, bar) => sum + bar.count, 0);
  return (
    <div className="chart">
      <div
        className="chart-stack"
        role="img"
        aria-label={
          total
            ? `Work by status: ${bars
                .filter((bar) => bar.count)
                .map((bar) => `${bar.count} ${bar.label.toLowerCase()}`)
                .join(", ")}`
            : "No work yet"
        }
      >
        {total === 0 ? (
          <span className="chart-empty-bar" />
        ) : (
          bars
            .filter((bar) => bar.count > 0)
            .map((bar) => (
              <span
                key={bar.status}
                className="chart-stack-part"
                style={{
                  width: `${bar.share * 100}%`,
                  background: statusTone[bar.status],
                }}
              />
            ))
        )}
      </div>
      <ul className="chart-legend">
        {bars.map((bar) => (
          <li key={bar.status}>
            <i
              style={{ background: statusTone[bar.status] }}
              aria-hidden="true"
            />
            {bar.label}
            <b>{bar.count}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DueChart({
  days,
}: {
  days: { day: string; count: number; isToday: boolean }[];
}) {
  const tallest = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const label = (day: string) =>
    new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(
      new Date(`${day}T12:00:00`),
    );
  return (
    <div className="chart">
      <div
        className="chart-columns"
        role="img"
        aria-label={
          total
            ? `${total} item${total === 1 ? "" : "s"} due in the next ${days.length} days`
            : `Nothing due in the next ${days.length} days`
        }
      >
        {days.map((day) => (
          <span
            key={day.day}
            className={`chart-column ${day.isToday ? "is-today" : ""}`}
            title={`${label(day.day)}: ${day.count}`}
          >
            <i
              style={{
                // A zero day keeps a sliver so the axis reads as a row of days
                // rather than a gap where the week should be.
                height: day.count ? `${(day.count / tallest) * 100}%` : "3px",
              }}
            />
          </span>
        ))}
      </div>
      {days.length > 0 && (
        // Guarded: the window is empty until the client knows what day it is,
        // and formatting "" throws RangeError — which took the whole page down
        // to client rendering with "Invalid time value".
        <div className="chart-axis">
          <span>{label(days[0].day)}</span>
          <span>{label(days[days.length - 1].day)}</span>
        </div>
      )}
    </div>
  );
}

export function FunnelChart({
  stages,
}: {
  stages: {
    stage: (typeof pipelineStages)[number];
    count: number;
    share: number;
  }[];
}) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  return (
    <div
      className="chart chart-funnel"
      role="img"
      aria-label={
        total
          ? `Pipeline: ${stages
              .filter((stage) => stage.count)
              .map((stage) => `${stage.count} at ${stage.stage.toLowerCase()}`)
              .join(", ")}`
          : "Nothing in the pipeline"
      }
    >
      {stages.map((stage) => (
        <div key={stage.stage}>
          <span>{stage.stage}</span>
          <i
            style={{
              width: `${Math.max(stage.share * 100, stage.count ? 6 : 0)}%`,
            }}
          />
          <b>{stage.count}</b>
        </div>
      ))}
    </div>
  );
}

export function WorkloadChart({
  rows,
}: {
  rows: { id: string; name: string; count: number; share: number }[];
}) {
  if (!rows.length)
    return <p className="muted">Nothing assigned to anyone yet.</p>;
  return (
    <div
      className="chart chart-funnel"
      role="img"
      aria-label={`Open work by person: ${rows
        .map((row) => `${row.name} ${row.count}`)
        .join(", ")}`}
    >
      {rows.map((row) => (
        <div key={row.id || "unassigned"}>
          <span>{row.name}</span>
          <i
            className={row.id ? "" : "is-unassigned"}
            style={{ width: `${Math.max(row.share * 100, 6)}%` }}
          />
          <b>{row.count}</b>
        </div>
      ))}
    </div>
  );
}

export { statusLabels };
