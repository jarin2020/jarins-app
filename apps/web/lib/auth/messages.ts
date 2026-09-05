/**
 * Human copy for authentication failures, and the rules the forms validate
 * against before they ever reach the network.
 *
 * Supabase returns messages written for developers — "Invalid login
 * credentials", "Signups not allowed for otp", "Email address not authorized".
 * Showing those verbatim was the previous behaviour and it left people with no
 * idea what to do next. Everything here maps a failure onto a `reason` the
 * forms can act on: an unconfirmed address offers to resend, a missing account
 * points at sign-up, a throttled request says how long to wait.
 *
 * Pure and dependency-free so it can be tested without a browser or a project.
 */

/** Matches the 10-character minimum the household agreed on, not Supabase's 6. */
export const PASSWORD_MIN_LENGTH = 10;

export type AuthFailureReason =
  | "bad-credentials"
  | "unconfirmed"
  | "no-account"
  | "already-registered"
  | "throttled"
  | "weak-password"
  | "same-password"
  | "invalid-email"
  | "undeliverable"
  | "signup-disabled"
  | "provisioning"
  | "unknown";

export type AuthFailure = {
  /** Shown to the person. Complete sentences, no error codes. */
  message: string;
  /** What the form should offer next. */
  reason: AuthFailureReason;
  /** Present only when the server told us how long to wait. */
  retryAfterSeconds?: number;
};

/** The shape of a Supabase `AuthError` we actually rely on. */
type SupabaseAuthErrorLike = {
  message?: string;
  code?: string;
  status?: number;
};

/**
 * Supabase says "you can only request this after 47 seconds" rather than
 * setting Retry-After, so the wait has to be read out of the sentence.
 */
function parseRetrySeconds(message: string): number | undefined {
  const match = /after (\d+) seconds?/i.exec(message);
  return match ? Number(match[1]) : undefined;
}

const BY_REASON: Record<AuthFailureReason, string> = {
  "bad-credentials":
    "That email and password do not match an account. Check the password, or use a magic link instead.",
  unconfirmed:
    "This address has not been confirmed yet. Check your inbox for the confirmation email, or send a new one below.",
  "no-account":
    "No account uses that email yet. Create one and it takes a minute.",
  "already-registered":
    "An account already uses that email. Sign in instead, or reset the password if you have forgotten it.",
  throttled:
    "Too many requests in a short window. Wait a moment and try again.",
  "weak-password": `Choose a longer password — at least ${PASSWORD_MIN_LENGTH} characters. A short phrase you will remember beats a complicated word.`,
  "same-password": "That is already your password. Choose a different one.",
  "invalid-email": "That does not look like a valid email address.",
  undeliverable:
    "The account was not created because confirmation email could not be sent. This project has no SMTP sender configured yet, so it can only mail its own team. Someone with dashboard access has to add one.",
  "signup-disabled":
    "New accounts are turned off for this deployment right now.",
  provisioning:
    "The account was created but its household could not be set up, so nothing could be saved to it. This needs a developer — the sign-up database trigger failed.",
  unknown: "Something went wrong. Try again in a moment.",
};

function failure(
  reason: AuthFailureReason,
  retryAfterSeconds?: number,
): AuthFailure {
  return { reason, message: BY_REASON[reason], retryAfterSeconds };
}

/**
 * Translates a Supabase auth error into something worth showing someone.
 *
 * Matches on `error.code` first because it is stable across releases, and falls
 * back to the message text for the handful of failures that arrive as a bare
 * 500 — most importantly the sign-up trigger, which surfaces only as
 * "Database error saving new user".
 */
export function describeAuthError(
  error: SupabaseAuthErrorLike | null | undefined,
): AuthFailure {
  if (!error) return failure("unknown");
  const text = error.message ?? "";
  const lower = text.toLowerCase();

  switch (error.code) {
    case "invalid_credentials":
      return failure("bad-credentials");
    case "email_not_confirmed":
      return failure("unconfirmed");
    case "otp_disabled":
      // signInWithOtp with shouldCreateUser: false and nobody to sign in.
      return failure("no-account");
    case "user_already_exists":
    case "email_exists":
      return failure("already-registered");
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return failure("throttled", parseRetrySeconds(text));
    case "weak_password":
      return failure("weak-password");
    case "same_password":
      return failure("same-password");
    case "email_address_invalid":
    case "validation_failed":
      return failure("invalid-email");
    case "email_address_not_authorized":
      return failure("undeliverable");
    case "signup_disabled":
      return failure("signup-disabled");
  }

  // No code, or one we do not recognise: fall back to the sentence.
  if (lower.includes("database error")) return failure("provisioning");
  if (lower.includes("error sending")) return failure("undeliverable");
  if (lower.includes("not confirmed")) return failure("unconfirmed");
  if (lower.includes("invalid login credentials"))
    return failure("bad-credentials");
  if (lower.includes("for security purposes"))
    return failure("throttled", parseRetrySeconds(text));

  return failure("unknown");
}

/**
 * Copy for the `?error=` values `/auth/callback` redirects with. Kept beside
 * the rest so every sentence a person can be shown while signed out lives in
 * one file.
 */
export const LINK_ERRORS: Record<string, string> = {
  missing_code: "That sign-in link was incomplete. Ask for a new one below.",
  link_expired:
    "That link has expired. Links are valid for one hour — request a new one below.",
  link_invalid:
    "That link has already been used. Each one works once — request a new one below.",
  not_configured: "Accounts are not available on this deployment yet.",
  access_denied: "That link is no longer valid. Request a new one below.",
};

export function describeLinkError(value: string | null): string {
  if (!value) return "";
  return LINK_ERRORS[value] ?? LINK_ERRORS.link_invalid;
}

/**
 * Deliberately permissive. The authority on whether an address exists is the
 * confirmation email, so this only catches typing mistakes early — a stricter
 * pattern rejects valid addresses and helps nobody.
 */
export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 254;
}

/** Returns the problem with a password, or null when it is acceptable. */
export function validatePassword(password: string, email = ""): string | null {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Use at least ${PASSWORD_MIN_LENGTH} characters. A short phrase you will remember beats a complicated word.`;
  if (password.length > 72)
    // bcrypt truncates past 72 bytes, so anything longer is silently ignored.
    return "That password is too long. Use 72 characters or fewer.";
  const localPart = email.trim().toLowerCase().split("@")[0];
  if (localPart.length > 2 && password.toLowerCase().includes(localPart))
    return "Do not build the password out of your email address.";
  return null;
}
