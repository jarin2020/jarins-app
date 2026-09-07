import { describe, expect, it } from "vitest";
import type { LifeRecord } from "./records/schema";
import {
  countByCategory,
  matches,
  personHits,
  recordHits,
  teamHits,
  threadHits,
} from "./search";

const record = (over: Partial<LifeRecord>): LifeRecord => ({
  id: "1",
  module: "family",
  kind: "Task",
  title: "Kita bag",
  detail: "",
  status: "open",
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("search", () => {
  it("requires every word, so a second word narrows rather than widens", () => {
    expect(matches("Kita: spare bag and bottle", "kita bag")).toBe(true);
    expect(matches("Bag of compost", "kita bag")).toBe(false);
    expect(matches("anything", "  ")).toBe(false);
  });

  it("is case and order insensitive", () => {
    expect(matches("Passport renewal", "RENEWAL passport")).toBe(true);
  });

  it("searches a record's title, detail, kind and module", () => {
    const records = [
      record({ id: "a", title: "Passport", module: "documents" }),
      record({ id: "b", title: "Nothing", detail: "renew the passport" }),
      record({ id: "c", title: "Unrelated" }),
    ];
    expect(recordHits(records, "passport").map((hit) => hit.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("gives documents their own category and everything else Tasks", () => {
    const hits = recordHits(
      [
        record({ id: "a", title: "Passport", module: "documents" }),
        record({ id: "b", title: "Passport photo run", module: "family" }),
      ],
      "passport",
    );
    expect(hits.map((hit) => hit.category)).toEqual(["documents", "tasks"]);
  });

  it("labels a hit with where it lives", () => {
    const [hit] = recordHits(
      [record({ title: "Kita bag", kind: "Routine", module: "family" })],
      "kita",
    );
    expect(hit.subtitle).toBe("Routine · Family");
    expect(hit.href).toBe("/family");
  });

  it("finds people, teams and threads too", () => {
    expect(
      personHits(
        [{ id: "p", name: "Faria", detail: "f@example.test" }],
        "faria",
      ),
    ).toHaveLength(1);
    expect(
      teamHits([{ id: "t", name: "Growth pod", memberCount: 2 }], "growth")[0]
        .subtitle,
    ).toBe("2 members");
    expect(
      threadHits(
        [{ id: "x", title: "Launch", workspace: "professional" }],
        "launch",
      )[0].subtitle,
    ).toBe("Professional conversation");
  });

  it("finds across both workspaces, because you should not search twice", () => {
    const hits = threadHits(
      [
        { id: "a", title: "Launch plan", workspace: "professional" },
        { id: "b", title: "Launch party", workspace: "personal" },
      ],
      "launch",
    );
    expect(hits).toHaveLength(2);
  });

  it("returns nothing for an empty query rather than everything", () => {
    expect(recordHits([record({})], "   ")).toEqual([]);
    expect(personHits([{ id: "p", name: "Faria" }], "")).toEqual([]);
  });

  it("counts every category, including the empty ones", () => {
    const counts = countByCategory([
      { id: "1", category: "tasks", title: "", subtitle: "", href: "" },
      { id: "2", category: "tasks", title: "", subtitle: "", href: "" },
      { id: "3", category: "people", title: "", subtitle: "", href: "" },
    ]);
    expect(counts).toMatchObject({
      tasks: 2,
      people: 1,
      teams: 0,
      documents: 0,
      threads: 0,
      files: 0,
    });
  });
});
