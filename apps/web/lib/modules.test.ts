import { describe, expect, it } from "vitest";
import { findModule, primaryModules } from "./modules";

describe("information architecture", () => {
  it("contains the nine primary life areas", () =>
    expect(primaryModules).toHaveLength(9));
  it("falls back to Today for unknown routes", () =>
    expect(findModule("unknown").key).toBe("today"));
});
