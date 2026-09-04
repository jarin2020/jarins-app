import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCloudRepository,
  rowToRecord,
  recordToRow,
} from "./cloud-repository";
import {
  localRepository,
  parseBackup,
  readLifeRecords,
  replaceLifeRecords,
} from "./local-repository";
import { hasPendingLocalRecords, migrateLocalRecords } from "./migrate";
import { SEED_IDS, seedRecords } from "./seed";
import type { LifeRecord } from "./schema";

const record = (over: Partial<LifeRecord> = {}): LifeRecord => ({
  id: "11111111-1111-1111-1111-111111111111",
  module: "money",
  kind: "Annual cost",
  title: "Insurance renewal",
  detail: "Check coverage first",
  status: "open",
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
  ...over,
});

describe("money is stored as integer cents", () => {
  it("round-trips an amount without floating-point drift", () => {
    const row = recordToRow(record({ amount: 195.35 }));
    expect(row.amount_cents).toBe(19535);
    expect(
      rowToRecord({
        ...row,
        id: record().id,
        date: null,
        progress: null,
        created_at: record().createdAt,
        updated_at: record().updatedAt,
      } as never).amount,
    ).toBe(195.35);
  });

  it("rounds rather than truncating a third decimal", () => {
    expect(recordToRow(record({ amount: 0.015 })).amount_cents).toBe(2);
  });

  it("keeps an absent amount absent instead of turning it into zero", () => {
    expect(recordToRow(record()).amount_cents).toBeNull();
    const back = rowToRecord({
      ...recordToRow(record()),
      id: record().id,
      date: null,
      progress: null,
      created_at: record().createdAt,
      updated_at: record().updatedAt,
    } as never);
    expect(back.amount).toBeUndefined();
  });

  it("reads bigint cents that PostgREST returned as a string", () => {
    const back = rowToRecord({
      ...recordToRow(record()),
      amount_cents: "4200",
      id: record().id,
      date: null,
      progress: null,
      created_at: record().createdAt,
      updated_at: record().updatedAt,
    } as never);
    expect(back.amount).toBe(42);
  });
});

describe("cloud realtime subscriptions", () => {
  it("uses a fresh channel while the previous async cleanup is pending", () => {
    const topics: string[] = [];
    const removeChannel = vi.fn().mockReturnValue(new Promise(() => {}));
    const client = {
      channel: vi.fn((topic: string) => {
        topics.push(topic);
        const channel = {
          on: vi.fn(() => channel),
          subscribe: vi.fn(() => channel),
        };
        return channel;
      }),
      removeChannel,
    };
    const repository = createCloudRepository(client as never, "household-1");

    const unsubscribe = repository.subscribe(vi.fn());
    unsubscribe();
    repository.subscribe(vi.fn());

    expect(removeChannel).toHaveBeenCalledOnce();
    expect(topics).toHaveLength(2);
    expect(topics[0]).not.toBe(topics[1]);
  });
});

describe("backup validation", () => {
  it("accepts a well-formed export", () => {
    expect(parseBackup({ lifeRecords: [record()] }).lifeRecords).toHaveLength(
      1,
    );
  });

  it("names the offending field instead of failing generically", () => {
    expect(() =>
      parseBackup({ lifeRecords: [{ ...record(), progress: 250 }] }),
    ).toThrow(/progress/);
  });

  it("rejects a payload with no records array at all", () => {
    expect(() => parseBackup({ nope: true })).toThrow();
  });

  it("still rejects malformed life records with the original message", () => {
    expect(() => replaceLifeRecords([{ id: "broken" }] as never)).toThrow(
      /valid life records/i,
    );
  });
});

describe("migrating this browser's records into an account", () => {
  beforeEach(() => localStorage.clear());

  const fakeSupabase = (result: { error: { message: string } | null }) => {
    const insert = vi.fn().mockResolvedValue(result);
    return { client: { from: () => ({ insert }) } as never, insert };
  };

  it("never uploads the demo seed", async () => {
    replaceLifeRecords(seedRecords());
    const { client, insert } = fakeSupabase({ error: null });
    await expect(migrateLocalRecords(client, "household-1")).resolves.toEqual({
      status: "nothing-to-move",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("uploads only the records the user actually typed", async () => {
    replaceLifeRecords([
      ...seedRecords(),
      record({ id: "aaaaaaaa-0000-0000-0000-000000000001", title: "Mine" }),
    ]);
    const { client, insert } = fakeSupabase({ error: null });
    await expect(migrateLocalRecords(client, "household-1")).resolves.toEqual({
      status: "moved",
      count: 1,
    });
    const rows = insert.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Mine",
      household_id: "household-1",
    });
    // Ids are reassigned by the database, so none is sent — a slug id from an
    // old backup would otherwise fail the uuid primary key.
    expect(rows[0]).not.toHaveProperty("id");
    // …but the original creation date survives the move.
    expect(rows[0].created_at).toBe("2026-08-01T09:00:00.000Z");
  });

  it("stays retryable when the upload fails", async () => {
    replaceLifeRecords([
      record({ id: "aaaaaaaa-0000-0000-0000-000000000002", title: "Mine" }),
    ]);
    const { client } = fakeSupabase({ error: { message: "network down" } });
    await expect(migrateLocalRecords(client, "household-1")).resolves.toEqual({
      status: "failed",
    });
    expect(hasPendingLocalRecords()).toBe(true);
    expect(readLifeRecords()).toHaveLength(1);
  });

  it("runs only once after it succeeds", async () => {
    replaceLifeRecords([
      record({ id: "aaaaaaaa-0000-0000-0000-000000000003", title: "Mine" }),
    ]);
    const { client, insert } = fakeSupabase({ error: null });
    await migrateLocalRecords(client, "household-1");
    await migrateLocalRecords(client, "household-1");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(hasPendingLocalRecords()).toBe(false);
  });

  it("agrees with the seed about which ids are demo content", () => {
    expect(seedRecords().every((item) => SEED_IDS.has(item.id))).toBe(true);
    expect(SEED_IDS.size).toBe(seedRecords().length);
  });
});

describe("the local repository survives corrupted storage", () => {
  beforeEach(() => localStorage.clear());

  it("falls back to the seed rather than throwing", () => {
    localStorage.setItem("jarins-life-records-v1", "{not json");
    expect(readLifeRecords()).toHaveLength(seedRecords().length);
  });

  it("discards a stored array whose shape no longer matches", () => {
    localStorage.setItem(
      "jarins-life-records-v1",
      JSON.stringify([{ id: "x" }]),
    );
    expect(readLifeRecords()).toHaveLength(seedRecords().length);
  });

  it("reports its mode so screens can explain where data lives", () => {
    expect(localRepository.mode).toBe("local");
  });
});
