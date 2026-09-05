import { describe, expect, it } from "vitest";
import {
  describeAuthError,
  describeLinkError,
  isValidEmail,
  PASSWORD_MIN_LENGTH,
  validatePassword,
} from "./messages";

describe("describeAuthError", () => {
  it("routes an unconfirmed address to the resend offer", () => {
    const failure = describeAuthError({
      code: "email_not_confirmed",
      message: "Email not confirmed",
    });
    expect(failure.reason).toBe("unconfirmed");
    expect(failure.message).not.toContain("email_not_confirmed");
  });

  it("distinguishes a wrong password from a missing account", () => {
    expect(describeAuthError({ code: "invalid_credentials" }).reason).toBe(
      "bad-credentials",
    );
    expect(describeAuthError({ code: "otp_disabled" }).reason).toBe(
      "no-account",
    );
  });

  // The failure that actually blocked sign-up on this project: Supabase's
  // built-in sender only delivers to project members.
  it("explains an undeliverable confirmation rather than blaming the person", () => {
    const failure = describeAuthError({
      code: "email_address_not_authorized",
      message: "Email address not authorized",
    });
    expect(failure.reason).toBe("undeliverable");
    expect(failure.message).toContain("SMTP");
  });

  it("reads the wait out of a throttling message", () => {
    const failure = describeAuthError({
      message:
        "For security purposes, you can only request this after 47 seconds.",
    });
    expect(failure.reason).toBe("throttled");
    expect(failure.retryAfterSeconds).toBe(47);
  });

  // handle_new_user() failing on hosted auth.users surfaces only as a bare 500.
  it("recognises the sign-up trigger failing", () => {
    expect(
      describeAuthError({ message: "Database error saving new user" }).reason,
    ).toBe("provisioning");
  });

  it("never leaves the message empty", () => {
    for (const error of [null, undefined, {}, { message: "" }])
      expect(describeAuthError(error).message.length).toBeGreaterThan(0);
  });
});

describe("describeLinkError", () => {
  it("says nothing when no error was passed", () =>
    expect(describeLinkError(null)).toBe(""));
  it("falls back to copy rather than echoing an unknown code", () =>
    expect(describeLinkError("something_new")).toContain("request a new one"));
});

describe("isValidEmail", () => {
  it("accepts ordinary addresses, including plus tags", () => {
    expect(isValidEmail("faria@example.com")).toBe(true);
    expect(isValidEmail("faria+jarins@example.co.uk")).toBe(true);
    expect(isValidEmail("  faria@example.com  ")).toBe(true);
  });
  it("rejects the common typos", () => {
    for (const value of ["", "faria", "faria@", "@example.com", "a b@c.de"])
      expect(isValidEmail(value)).toBe(false);
  });
});

describe("validatePassword", () => {
  it("accepts a passphrase at the minimum length", () =>
    expect(validatePassword("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull());
  it("rejects anything shorter", () =>
    expect(validatePassword("a".repeat(PASSWORD_MIN_LENGTH - 1))).toContain(
      String(PASSWORD_MIN_LENGTH),
    ));
  // bcrypt silently truncates past 72 bytes, so a longer password is a lie.
  it("rejects passwords bcrypt would truncate", () =>
    expect(validatePassword("a".repeat(73))).toContain("72"));
  it("rejects a password built from the email", () =>
    expect(validatePassword("fariafariafaria", "faria@example.com")).toContain(
      "email address",
    ));
  it("ignores a two-character local part rather than over-matching", () =>
    expect(validatePassword("summer evenings", "fa@example.com")).toBeNull());
});
