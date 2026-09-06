import { describe, expect, it } from "vitest";
import { invitationLink, invitationMessage } from "./invitation-message";

describe("invitationLink", () => {
  // The middleware still redirects /invite/<token>, but a mailed link outlives
  // the redirect that rescues it.
  it("uses the canonical /auth/invite path", () => {
    expect(invitationLink("https://jarins.com", "abc123")).toBe(
      "https://jarins.com/auth/invite/abc123",
    );
  });

  it("does not double the separator when the origin has a trailing slash", () => {
    expect(invitationLink("https://jarins.com/", "abc123")).toBe(
      "https://jarins.com/auth/invite/abc123",
    );
  });

  it("escapes a token rather than letting it shape the path", () => {
    expect(invitationLink("https://jarins.com", "a/b?c")).toBe(
      "https://jarins.com/auth/invite/a%2Fb%3Fc",
    );
  });
});

describe("invitationMessage", () => {
  const base = {
    householdName: "Jarin household",
    inviterName: "Faria",
    link: "https://jarins.com/auth/invite/abc123",
    role: "adult" as const,
  };

  it("names the inviter and the household in the subject", () => {
    const message = invitationMessage(base);
    expect(message.subject).toContain("Faria");
    expect(message.subject).toContain("Jarin household");
  });

  it("carries the link in the body", () => {
    expect(invitationMessage(base).text).toContain(base.link);
  });

  it("describes what each role will be able to do", () => {
    expect(invitationMessage(base).text).toContain("add and change");
    expect(invitationMessage({ ...base, role: "viewer" }).text).toContain(
      "without changing it",
    );
  });

  // Someone who did not expect this needs to know that ignoring it is safe.
  it("tells an unexpecting recipient they can ignore it", () => {
    expect(invitationMessage(base).text).toContain("ignore this message");
  });
});
