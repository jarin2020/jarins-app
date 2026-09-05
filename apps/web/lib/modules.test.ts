import { describe, expect, it } from "vitest";
import {
  authRoutes,
  findModule,
  isKnownRoute,
  primaryModules,
} from "./modules";

describe("information architecture", () => {
  it("contains the nine primary life areas", () =>
    expect(primaryModules).toHaveLength(9));
  it("puts Home first in the primary navigation", () =>
    expect(primaryModules[0].key).toBe("home"));
  it("falls back to Today for unknown routes", () =>
    expect(findModule("unknown").key).toBe("today"));
  it("recognizes invitation links without accepting unknown route roots", () => {
    expect(isKnownRoute(["auth", "invite", "a-token"])).toBe(true);
    expect(isKnownRoute(["not-a-route"])).toBe(false);
  });
  it("accepts every signed-out screen under /auth", () => {
    for (const screen of authRoutes)
      expect(isKnownRoute(["auth", screen])).toBe(true);
  });
  it("404s /auth itself and any unknown child of it", () => {
    // /auth is a namespace, not a screen, so it must not render an empty shell.
    expect(isKnownRoute(["auth"])).toBe(false);
    expect(isKnownRoute(["auth", "nonsense"])).toBe(false);
  });
  it("still accepts life-area modules and standalone screens", () => {
    expect(isKnownRoute(["home"])).toBe(true);
    expect(isKnownRoute(["reset"])).toBe(true);
  });
});
