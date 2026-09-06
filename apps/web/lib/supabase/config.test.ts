import { describe, expect, it } from "vitest";
import { toSocketOrigin } from "./config";

describe("toSocketOrigin", () => {
  it("upgrades a hosted project URL to the wss origin", () => {
    expect(toSocketOrigin("https://abc.supabase.co")).toBe(
      "wss://abc.supabase.co",
    );
  });

  it("stays on ws for a local Supabase served over plain HTTP", () => {
    expect(toSocketOrigin("http://127.0.0.1:54321")).toBe(
      "ws://127.0.0.1:54321",
    );
  });

  it("drops a trailing slash, which CSP would read as a path prefix", () => {
    expect(toSocketOrigin(" https://abc.supabase.co/ ")).toBe(
      "wss://abc.supabase.co",
    );
  });
});
