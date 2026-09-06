import { describe, expect, it } from "vitest";
import {
  projectDefaults,
  resolveProject,
  suggestMark,
  withProject,
} from "./projects";

describe("project identity", () => {
  it("names each workspace differently out of the box", () => {
    expect(resolveProject(undefined, "personal")).toEqual(
      projectDefaults.personal,
    );
    expect(resolveProject(undefined, "professional").tagline).toBe(
      "Professional",
    );
    // Different accents so the two are told apart before either name is read.
    expect(projectDefaults.personal.accent).not.toBe(
      projectDefaults.professional.accent,
    );
  });

  it("reads back what was stored", () => {
    const prefs = {
      projects: {
        personal: {
          name: "Jarin household",
          tagline: "Home base",
          mark: "JH",
          accent: "terracotta" as const,
        },
      },
    };
    expect(resolveProject(prefs, "personal")).toEqual({
      name: "Jarin household",
      tagline: "Home base",
      mark: "JH",
      accent: "terracotta",
    });
    // The workspace that was never customised keeps its default.
    expect(resolveProject(prefs, "professional")).toEqual(
      projectDefaults.professional,
    );
  });

  it("costs you the broken field, not the whole sidebar", () => {
    const prefs = {
      projects: {
        personal: {
          name: "   ",
          tagline: "Home base",
          mark: 42,
          accent: "hotpink",
        },
      },
    } as never;
    expect(resolveProject(prefs, "personal")).toEqual({
      name: projectDefaults.personal.name,
      tagline: "Home base",
      mark: projectDefaults.personal.mark,
      accent: projectDefaults.personal.accent,
    });
  });

  it("survives a projects value that is not an object at all", () => {
    expect(
      resolveProject({ projects: "nonsense" } as never, "personal"),
    ).toEqual(projectDefaults.personal);
    expect(resolveProject({} as never, "professional")).toEqual(
      projectDefaults.professional,
    );
  });

  it("writes one workspace without disturbing the other", () => {
    const before = {
      projects: {
        professional: {
          name: "Faria Jarin",
          tagline: "Portfolio",
          mark: "FJ",
          accent: "slate" as const,
        },
      },
    };
    const after = withProject(before, "personal", {
      name: "Jarin household",
      tagline: "Home base",
      mark: "JH",
      accent: "amber",
    });

    expect(after.personal.name).toBe("Jarin household");
    expect(after.professional.name).toBe("Faria Jarin");
  });

  it("trims a field to the length the editor accepts", () => {
    const after = withProject(undefined, "personal", {
      name: "x".repeat(90),
      tagline: "y".repeat(90),
      mark: "zzzzzzzz",
      accent: "green",
    });
    expect(after.personal.name).toHaveLength(40);
    expect(after.personal.tagline).toHaveLength(40);
    expect(after.personal.mark).toHaveLength(4);
  });

  it("falls back rather than storing an empty name", () => {
    const after = withProject(undefined, "professional", {
      name: "  ",
      tagline: "  ",
      mark: "  ",
      accent: "green",
    });
    expect(after.professional).toMatchObject({
      name: projectDefaults.professional.name,
      tagline: projectDefaults.professional.tagline,
      mark: projectDefaults.professional.mark,
    });
  });

  it("suggests a mark from the name", () => {
    expect(suggestMark("Jarin household", "personal")).toBe("jh");
    expect(suggestMark("Faria", "professional")).toBe("f");
    expect(suggestMark("   ", "personal")).toBe(projectDefaults.personal.mark);
  });
});
