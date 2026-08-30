"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { readLifeRecords } from "./local-repository";
import { recordToRow } from "./cloud-repository";
import { SEED_IDS } from "./seed";

const MIGRATED_KEY = "jarins-migrated-v1";

export type MigrationResult =
  | { status: "already-done" }
  | { status: "nothing-to-move" }
  | { status: "moved"; count: number }
  | { status: "failed" };

/**
 * Carries records typed before sign-up into the user's account. Runs once per
 * browser, on the first authenticated load.
 *
 * Two rules keep this safe to retry:
 *   1. The demo seed is never uploaded. Its ids are slugs, not UUIDs, so they
 *      would both fail the primary key and pollute every new account.
 *   2. The local copy is never deleted here, and the "done" marker is only
 *      written after a successful insert, so a failure retries on next load.
 */
export async function migrateLocalRecords(
  supabase: SupabaseClient,
  householdId: string | null,
): Promise<MigrationResult> {
  if (typeof window === "undefined") return { status: "already-done" };
  if (localStorage.getItem(MIGRATED_KEY)) return { status: "already-done" };

  const mine = readLifeRecords().filter((record) => !SEED_IDS.has(record.id));

  if (!mine.length) {
    localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
    return { status: "nothing-to-move" };
  }

  const { error } = await supabase.from("life_records").insert(
    // recordToRow drops the id (the database assigns a fresh uuid); created_at
    // is carried over so the history is not flattened to today.
    mine.map((record) => ({
      ...recordToRow(record, householdId ?? undefined),
      created_at: record.createdAt,
    })),
  );

  if (error) {
    console.error("[jarins] migration of local records failed", error.message);
    return { status: "failed" };
  }

  localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
  return { status: "moved", count: mine.length };
}

/** True when this browser still holds records that have never been uploaded. */
export function hasPendingLocalRecords() {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(MIGRATED_KEY)) return false;
  return readLifeRecords().some((record) => !SEED_IDS.has(record.id));
}
