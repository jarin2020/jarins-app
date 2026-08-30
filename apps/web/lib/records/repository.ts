import type { LifeRecord, NewLifeRecord } from "./schema";

/**
 * The seam that lets the data layer change without touching a single screen.
 *
 * Two implementations exist: `localRepository` (this browser, no account) and
 * `cloudRepository` (Supabase, authorization enforced by RLS). Components never
 * see either — they go through `useLifeRecords()`.
 */
export interface RecordsRepository {
  readonly mode: "local" | "cloud";
  list(): Promise<LifeRecord[]>;
  add(input: NewLifeRecord): Promise<LifeRecord>;
  update(id: string, changes: Partial<LifeRecord>): Promise<LifeRecord>;
  remove(id: string): Promise<void>;
  /** Restores a backup, replacing everything currently stored. */
  replaceAll(records: LifeRecord[]): Promise<LifeRecord[]>;
  /** Notifies on out-of-band changes (another tab, another device). */
  subscribe(onChange: () => void): () => void;
}
