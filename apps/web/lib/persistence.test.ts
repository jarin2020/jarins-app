import { beforeEach, describe, expect, it, vi } from "vitest";
import { readLifeRecords, replaceLifeRecords, type LifeRecord } from "./jarins-store";
import { preferenceDefaults, readPreferences, writePreferences } from "./preferences-store";

describe("Jarins local persistence", () => {
  beforeEach(() => localStorage.clear());

  it("restores a valid life-record backup", () => {
    const record: LifeRecord = { id: "backup-1", module: "future", kind: "Project", title: "Restored project", detail: "From backup", status: "open", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
    replaceLifeRecords([record]);
    expect(readLifeRecords()).toEqual([record]);
  });

  it("rejects malformed life-record backups", () => {
    expect(() => replaceLifeRecords([{ id: "broken" }] as LifeRecord[])).toThrow(/valid life records/i);
  });

  it("saves preferences and announces the change", () => {
    const listener = vi.fn();
    window.addEventListener("jarins-preferences-changed", listener);
    writePreferences({ ...preferenceDefaults, name: "Updated name", reminders: false });
    expect(readPreferences()).toMatchObject({ name: "Updated name", reminders: false });
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("jarins-preferences-changed", listener);
  });
});
