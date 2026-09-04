import { describe, expect, it } from "vitest";
import { findModule, isKnownRoute, primaryModules } from "./modules";

describe("information architecture", () => {
  it("contains the nine primary life areas", () =>
    expect(primaryModules).toHaveLength(9));
  it("puts Home first in the primary navigation", () =>
    expect(primaryModules[0].key).toBe("home"));
  it("falls back to Today for unknown routes", () =>
    expect(findModule("unknown").key).toBe("today"));
  it("recognizes invitation links without accepting unknown route roots", () => {
    expect(isKnownRoute("invite")).toBe(true);
    expect(isKnownRoute("not-a-route")).toBe(false);
  });
});
