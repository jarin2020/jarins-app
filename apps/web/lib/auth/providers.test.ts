import { describe, expect, it } from "vitest";
import {
  OAUTH_PROVIDER_LABELS,
  OAUTH_PROVIDERS,
  parseOAuthProviders,
} from "./providers";

describe("parseOAuthProviders", () => {
  it("treats an unset or empty allowlist as no providers", () => {
    expect(parseOAuthProviders(undefined)).toEqual([]);
    expect(parseOAuthProviders("")).toEqual([]);
    expect(parseOAuthProviders("  ,  ")).toEqual([]);
  });

  it("keeps the order the deployment wrote them in", () => {
    expect(parseOAuthProviders("apple,google")).toEqual(["apple", "google"]);
    expect(parseOAuthProviders("google,apple")).toEqual(["google", "apple"]);
  });

  it("tolerates spacing and casing around the names", () => {
    expect(parseOAuthProviders(" Google , GITHUB ")).toEqual([
      "google",
      "github",
    ]);
  });

  // A typo must not reach the card: the resulting button would navigate to the
  // authorize endpoint and come straight back as access_denied.
  it("drops names Supabase does not know", () => {
    expect(parseOAuthProviders("google,facebok,twitter")).toEqual(["google"]);
  });

  it("does not render the same provider twice", () => {
    expect(parseOAuthProviders("google,google")).toEqual(["google"]);
  });
});

describe("provider labels", () => {
  it("names every provider the app can offer", () => {
    for (const provider of OAUTH_PROVIDERS) {
      expect(OAUTH_PROVIDER_LABELS[provider]).toBeTruthy();
    }
  });

  // Supabase calls Microsoft accounts "azure"; nobody signing in does.
  it("calls azure Microsoft", () => {
    expect(OAUTH_PROVIDER_LABELS.azure).toBe("Microsoft");
  });
});
