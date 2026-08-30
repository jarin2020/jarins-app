"use client";

import {
  backupSchema,
  lifeRecordSchema,
  type LifeRecord,
  type NewLifeRecord,
} from "./schema";
import type { RecordsRepository } from "./repository";
import { seedRecords } from "./seed";

const STORAGE_KEY = "jarins-life-records-v1";
const EVENT_NAME = "jarins-life-records-changed";

/**
 * Reads and validates the stored records. Anything malformed falls back to the
 * seed rather than crashing a screen — a corrupted key should not lock the user
 * out of their own app.
 */
export function readLifeRecords(): LifeRecord[] {
  if (typeof window === "undefined") return seedRecords();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = seedRecords();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    const parsed = lifeRecordSchema.array().safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : seedRecords();
  } catch {
    return seedRecords();
  }
}

function writeLifeRecords(records: LifeRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  window.dispatchEvent(new Event(EVENT_NAME));
}

/**
 * Restores a backup. Kept as a named export because Settings → Data and the
 * persistence tests both call it directly.
 */
export function replaceLifeRecords(records: LifeRecord[]): LifeRecord[] {
  const parsed = lifeRecordSchema.array().safeParse(records);
  if (!parsed.success)
    throw new Error("This backup does not contain valid life records.");
  writeLifeRecords(parsed.data);
  return parsed.data;
}

/** Validates a whole export file and reports the first field-level problem. */
export function parseBackup(payload: unknown) {
  const parsed = backupSchema.safeParse(payload);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const path = issue?.path.join(".");
  throw new Error(
    path
      ? `This backup could not be read: ${path} — ${issue?.message.toLowerCase()}.`
      : "This backup does not contain valid life records.",
  );
}

export const localRepository: RecordsRepository = {
  mode: "local",

  async list() {
    return readLifeRecords();
  },

  async add(input: NewLifeRecord) {
    const now = new Date().toISOString();
    const record: LifeRecord = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    writeLifeRecords([record, ...readLifeRecords()]);
    return record;
  },

  async update(id: string, changes: Partial<LifeRecord>) {
    const next = readLifeRecords().map((record) =>
      record.id === id
        ? { ...record, ...changes, updatedAt: new Date().toISOString() }
        : record,
    );
    writeLifeRecords(next);
    const updated = next.find((record) => record.id === id);
    if (!updated) throw new Error("That item no longer exists.");
    return updated;
  },

  async remove(id: string) {
    writeLifeRecords(readLifeRecords().filter((record) => record.id !== id));
  },

  async replaceAll(records: LifeRecord[]) {
    return replaceLifeRecords(records);
  },

  subscribe(onChange: () => void) {
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onChange);
    };
  },
};
