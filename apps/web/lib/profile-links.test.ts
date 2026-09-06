import { describe, expect, it } from "vitest";
import {
  detectProfilePlatform,
  normalizeProfileUrl,
  parseProfileLinks,
  profileLinkHandle,
  profileLinkLabel,
  profilePlatform,
} from "./profile-links";

describe("profile links", () => {
  it("recognises a network from its host and its subdomains", () => {
    expect(detectProfilePlatform("https://www.linkedin.com/in/faria")).toBe(
      "linkedin",
    );
    expect(detectProfilePlatform("https://xing.com/profile/Faria")).toBe(
      "xing",
    );
    expect(detectProfilePlatform("https://open.spotify.com/user/faria")).toBe(
      "spotify",
    );
  });

  it("keeps the old host of a network that renamed itself", () => {
    expect(detectProfilePlatform("https://twitter.com/faria")).toBe("x");
    expect(detectProfilePlatform("https://x.com/faria")).toBe("x");
  });

  it("treats an unlisted mastodon instance as mastodon", () => {
    expect(detectProfilePlatform("https://mastodon.social/@faria")).toBe(
      "mastodon",
    );
    expect(detectProfilePlatform("https://mstdn.jp/@faria")).toBe("mastodon");
  });

  it("falls back to a website rather than refusing a personal domain", () => {
    expect(detectProfilePlatform("https://faria.example")).toBe("website");
    expect(profilePlatform("a-network-from-a-later-build").id).toBe("website");
  });

  it("does not mistake a lookalike host for the real one", () => {
    expect(
      detectProfilePlatform("https://linkedin.com.phish.example/in/x"),
    ).toBe("website");
  });

  it("assumes https for the host people actually paste", () => {
    expect(normalizeProfileUrl("linkedin.com/in/faria")).toBe(
      "https://linkedin.com/in/faria",
    );
    expect(normalizeProfileUrl("  https://xing.com/profile/Faria  ")).toBe(
      "https://xing.com/profile/Faria",
    );
  });

  it("rejects anything that is not an http address", () => {
    expect(normalizeProfileUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeProfileUrl("data:text/html,<script>")).toBeNull();
    expect(normalizeProfileUrl("mailto:faria@example.test")).toBeNull();
    // Credentials in the authority: what a lookalike link is actually made of.
    expect(
      normalizeProfileUrl("https://linkedin.com@evil.example/in/x"),
    ).toBeNull();
    expect(normalizeProfileUrl("localhost")).toBeNull();
    expect(normalizeProfileUrl("")).toBeNull();
    expect(
      normalizeProfileUrl(`https://example.test/${"x".repeat(300)}`),
    ).toBeNull();
  });

  it("drops malformed rows instead of failing the whole profile", () => {
    expect(
      parseProfileLinks([
        { platform: "linkedin", url: "https://www.linkedin.com/in/faria" },
        { platform: "github", url: "javascript:alert(1)" },
        { url: "https://xing.com/profile/Faria" },
        "not an object",
        null,
      ]),
    ).toEqual([
      { platform: "linkedin", url: "https://www.linkedin.com/in/faria" },
      { platform: "xing", url: "https://xing.com/profile/Faria" },
    ]);
    expect(parseProfileLinks("[]")).toEqual([]);
  });

  it("caps what it reads back at the limit the column enforces", () => {
    const stored = Array.from({ length: 14 }, (_, index) => ({
      platform: "website",
      url: `https://example.test/${index}`,
    }));
    expect(parseProfileLinks(stored)).toHaveLength(10);
  });

  it("names a link by the person's label, then by the network", () => {
    const link = { platform: "website", url: "https://faria.example" } as const;
    expect(profileLinkLabel(link)).toBe("Website");
    expect(profileLinkLabel({ ...link, label: "Portfolio" })).toBe("Portfolio");
    expect(profileLinkLabel({ ...link, label: "   " })).toBe("Website");
  });

  it("shows a readable handle rather than the whole URL", () => {
    expect(
      profileLinkHandle({
        platform: "linkedin",
        url: "https://www.linkedin.com/in/faria/",
      }),
    ).toBe("linkedin.com/in/faria");
  });
});
