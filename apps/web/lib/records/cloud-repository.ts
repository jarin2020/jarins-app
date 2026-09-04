"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  lifeRecordSchema,
  type LifeRecord,
  type NewLifeRecord,
} from "./schema";
import type { RecordsRepository } from "./repository";

/** The `life_records` row shape. Money is integer cents in the database. */
type Row = {
  id: string;
  module: LifeRecord["module"];
  kind: string;
  title: string;
  detail: string;
  date: string | null;
  status: LifeRecord["status"];
  amount_cents: number | string | null;
  progress: number | null;
  essential: boolean;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id,module,kind,title,detail,date,status,amount_cents,progress,essential,created_at,updated_at";

/**
 * Cents are stored as bigint, which PostgREST returns as a string once the value
 * exceeds the safe integer range. Normalise both forms.
 */
function centsToAmount(value: Row["amount_cents"]): number | undefined {
  if (value === null || value === undefined) return undefined;
  const cents = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(cents) ? cents / 100 : undefined;
}

function amountToCents(amount: number | undefined): number | null {
  if (amount === undefined) return null;
  return Math.round(amount * 100);
}

export function rowToRecord(row: Row): LifeRecord {
  return lifeRecordSchema.parse({
    id: row.id,
    module: row.module,
    kind: row.kind,
    title: row.title,
    detail: row.detail ?? "",
    date: row.date ?? undefined,
    status: row.status,
    amount: centsToAmount(row.amount_cents),
    progress: row.progress ?? undefined,
    essential: row.essential || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/**
 * Only the columns a client is allowed to set; the rest are database defaults.
 *
 * The id is deliberately never emitted. Locally generated ids are UUIDs, but a
 * record restored from an old backup can carry a slug, which would fail the uuid
 * primary key and abort the entire insert. The database assigns them.
 */
export function recordToRow(record: NewLifeRecord, householdId?: string) {
  return {
    ...(householdId ? { household_id: householdId } : {}),
    module: record.module,
    kind: record.kind,
    title: record.title,
    detail: record.detail ?? "",
    date: record.date ?? null,
    status: record.status,
    amount_cents: amountToCents(record.amount),
    progress: record.progress ?? null,
    essential: record.essential ?? false,
  };
}

function fail(message: string, error: { message: string }): never {
  // Never surface raw Postgres text to the user; it leaks column names.
  console.error(`[jarins] ${message}`, error.message);
  throw new Error(message);
}

export function createCloudRepository(
  supabase: SupabaseClient,
  householdId: string | null,
): RecordsRepository {
  return {
    mode: "cloud",

    async list() {
      const { data, error } = await supabase
        .from("life_records")
        .select(COLUMNS)
        .order("created_at", { ascending: false });
      if (error) fail("Your items could not be loaded.", error);
      return (data as Row[]).map(rowToRecord);
    },

    async add(input: NewLifeRecord) {
      const { data, error } = await supabase
        .from("life_records")
        .insert(recordToRow(input, householdId ?? undefined))
        .select(COLUMNS)
        .single();
      if (error) fail("That item could not be saved.", error);
      return rowToRecord(data as Row);
    },

    async update(id: string, changes: Partial<LifeRecord>) {
      // Build the patch from supplied keys only, so an update never blanks a
      // field the caller did not mention.
      const patch: Record<string, unknown> = {};
      if (changes.module !== undefined) patch.module = changes.module;
      if (changes.kind !== undefined) patch.kind = changes.kind;
      if (changes.title !== undefined) patch.title = changes.title;
      if (changes.detail !== undefined) patch.detail = changes.detail;
      if (changes.date !== undefined) patch.date = changes.date ?? null;
      if (changes.status !== undefined) patch.status = changes.status;
      if (changes.amount !== undefined)
        patch.amount_cents = amountToCents(changes.amount);
      if (changes.progress !== undefined)
        patch.progress = changes.progress ?? null;
      if (changes.essential !== undefined) patch.essential = changes.essential;

      const { data, error } = await supabase
        .from("life_records")
        .update(patch)
        .eq("id", id)
        .select(COLUMNS)
        .single();
      if (error) fail("That change could not be saved.", error);
      return rowToRecord(data as Row);
    },

    async remove(id: string) {
      const { error } = await supabase
        .from("life_records")
        .delete()
        .eq("id", id);
      if (error) fail("That item could not be deleted.", error);
    },

    async replaceAll(records: LifeRecord[]) {
      const { error: clearError } = await supabase
        .from("life_records")
        .delete()
        .not("id", "is", null);
      if (clearError)
        fail("Your existing items could not be cleared.", clearError);

      if (!records.length) return [];
      const { data, error } = await supabase
        .from("life_records")
        // Backup ids may be pre-migration slugs, so let the database assign new ones.
        .insert(
          records.map((record) =>
            recordToRow(record, householdId ?? undefined),
          ),
        )
        .select(COLUMNS);
      if (error) fail("That backup could not be restored.", error);
      return (data as Row[]).map(rowToRecord);
    },

    subscribe(onChange: () => void) {
      // Realtime 2.112+ reuses an existing channel with the same topic. React
      // can start the replacement effect before the previous async
      // removeChannel() finishes, so a fixed topic returns the already-joined
      // channel and rejects adding this callback. A per-subscription topic
      // keeps those two lifecycles independent.
      const channel = supabase
        .channel(`life-records:${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "life_records" },
          onChange,
        )
        .subscribe();
      return () => {
        void supabase.removeChannel(channel);
      };
    },
  };
}
