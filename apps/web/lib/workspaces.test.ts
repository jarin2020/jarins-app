import { describe, expect, it } from "vitest";
import {
  allModules,
  findWorkspace,
  isKnownRoute,
  professionalModules,
  primaryModules,
  workspaces,
} from "./modules";
import { RECORD_MODULES, kindOptions, moduleLabels } from "./records/schema";
import { subsectionKinds } from "./records/sections";
import { preferenceDefaults } from "./preferences-store";

describe("workspaces", () => {
  it("opens on Personal, which is the one with something in it", () => {
    expect(preferenceDefaults.workspace).toBe("personal");
    expect(workspaces[0].id).toBe("personal");
    expect(findWorkspace(undefined).id).toBe("personal");
    expect(findWorkspace("nonsense").id).toBe("personal");
    expect(findWorkspace("professional").id).toBe("professional");
  });

  it("lands each workspace somewhere that exists", () => {
    for (const workspace of workspaces) {
      const home = workspace.home.replace("/", "");
      expect(isKnownRoute([home])).toBe(true);
      expect(
        workspace.modules.some((item) => item.href === workspace.home),
      ).toBe(true);
    }
  });

  it("routes every module in either workspace", () => {
    for (const item of [...primaryModules, ...professionalModules]) {
      expect(isKnownRoute([item.key])).toBe(true);
    }
    expect(isKnownRoute(["astrology"])).toBe(false);
  });

  it("gives the professional side its own areas, and shares the rest", () => {
    const personalKeys = primaryModules.map((item) => item.key);
    const professionalKeys = professionalModules.map((item) => item.key);

    // Its own
    expect(professionalKeys).toEqual(
      expect.arrayContaining(["work", "pipeline", "portfolio", "network"]),
    );
    // Shared, deliberately: the same records read in a working context
    expect(professionalKeys).toEqual(
      expect.arrayContaining(["career", "documents"]),
    );
    // Learning moved below the divider — something you do around the job.
    expect(professionalKeys).not.toContain("learning");
    // And nothing domestic
    expect(professionalKeys).not.toContain("family");
    expect(professionalKeys).not.toContain("home");
    expect(personalKeys).not.toContain("pipeline");
  });

  it("lists each module once, however many workspaces show it", () => {
    const keys = allModules.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every professional module a label, kinds and sections", () => {
    for (const key of ["work", "pipeline", "portfolio", "network"] as const) {
      expect(RECORD_MODULES).toContain(key);
      expect(moduleLabels[key]).toBeTruthy();
      expect(kindOptions[key].length).toBeGreaterThan(2);
      expect(Object.keys(subsectionKinds[key] ?? {}).length).toBeGreaterThan(0);
    }
  });

  it("only files records into kinds the module actually offers", () => {
    for (const [module, sections] of Object.entries(subsectionKinds)) {
      for (const kinds of Object.values(sections ?? {})) {
        for (const kind of kinds) {
          expect(
            kindOptions[module as keyof typeof kindOptions],
            `${module} is missing the kind "${kind}"`,
          ).toContain(kind);
        }
      }
    }
  });

  it("orders the professional rail the way the work is actually approached", () => {
    const professional = workspaces.find((w) => w.id === "professional")!;
    expect(professional.modules.map((item) => item.key)).toEqual([
      "work",
      "my-work",
      "teams",
      "pipeline",
      "network",
      "career",
      "documents",
      "portfolio",
    ]);
  });

  it("gives each workspace its own second group", () => {
    const personal = workspaces.find((w) => w.id === "personal")!;
    const professional = workspaces.find((w) => w.id === "professional")!;

    expect(personal.utility.map((item) => item.key)).toEqual([
      "inbox",
      "calendar",
      "vault",
    ]);
    expect(professional.utility.map((item) => item.key)).toEqual([
      "learning",
      "inbox",
      "calendar",
      "vault",
    ]);
  });

  it("routes My work, which is a view rather than a record module", () => {
    expect(isKnownRoute(["my-work"])).toBe(true);
    // Deliberately not a life-record module: nothing is filed under "my-work",
    // it is other modules' rows read through one person.
    expect(RECORD_MODULES).not.toContain("my-work");
  });
});
