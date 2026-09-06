"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Eye, EyeOff, Mail, MailCheck } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth-provider";
import {
  describeAuthError,
  describeLinkError,
  isValidEmail,
  PASSWORD_MIN_LENGTH,
  validatePassword,
} from "@/lib/auth/messages";
import {
  enabledOAuthProviders,
  OAUTH_PROVIDER_LABELS,
  OAUTH_PROVIDER_SCOPES,
  type OAuthProvider,
} from "@/lib/auth/providers";

/* -------------------------------------------------------------------------
 * Shared pieces
 * ---------------------------------------------------------------------- */

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="login-layout">
      <section className="login-message">
        <div className="brand">
          <span className="brand-mark">j.</span>
          <span>
            <strong>jarins</strong>
            <small>Life OS</small>
          </span>
        </div>
        <span className="eyebrow light">Private by design</span>
        <h1>Life feels lighter when it doesn’t all live in your head.</h1>
        <p>Your family, plans, learning and future — calm, clear and yours.</p>
      </section>
      <section className="login-card">{children}</section>
    </div>
  );
}

type Tone = "info" | "error" | "success";

/**
 * `role="alert"` for failures so a screen reader interrupts with them, the
 * politer `role="status"` for everything else.
 */
function StatusNote({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <p
      className={`login-status ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  describedBy,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="input-row">
      {label}
      <span className="password-field">
        <input
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-reveal"
          // The label says what pressing it does now, which is what a screen
          // reader user needs; aria-pressed would describe the state instead.
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </span>
    </label>
  );
}

/**
 * Counts down to zero and re-renders each second. Used to hold resend buttons
 * shut: Supabase rate-limits mail hard, and a person who cannot see a timer
 * just keeps clicking until they are locked out for an hour.
 */
function useCooldown() {
  const [remaining, setRemaining] = useState(0);
  const deadline = useRef(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setInterval(() => {
      const left = Math.ceil((deadline.current - Date.now()) / 1000);
      setRemaining(left > 0 ? left : 0);
    }, 1000);
    return () => clearInterval(timer);
  }, [remaining]);

  const start = useCallback((seconds: number) => {
    deadline.current = Date.now() + seconds * 1000;
    setRemaining(seconds);
  }, []);

  return { remaining, start };
}

/** Only relative, same-origin paths, so `next` cannot become an open redirect. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/home";
}

/**
 * Shown instead of a form when Supabase is not configured. The form used to
 * render anyway and only admit on submit that it could do nothing, which reads
 * as a broken sign-in rather than a deliberate local mode.
 */
function DemoNotice({ title }: { title: string }) {
  return (
    <AuthShell>
      <span className="eyebrow">Local mode</span>
      <h2>{title}</h2>
      <StatusNote tone="info">
        This deployment has no accounts. Everything you add stays in this
        browser, and nothing is sent anywhere.
      </StatusNote>
      <Link className="button primary" href="/home">
        Open Home
      </Link>
      <p className="login-footnote">
        Export from Settings to keep a copy of what is here.
      </p>
    </AuthShell>
  );
}

/**
 * Where Supabase sends the browser back once a mailed link or an identity
 * provider is finished. Always /auth/callback, which is the only route that can
 * finish a PKCE exchange, with the real destination carried in `next`.
 */
function useAuthRedirect(next: string) {
  return useMemo(
    () =>
      typeof window === "undefined"
        ? ""
        : `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
    [next],
  );
}

/**
 * Sign in and sign up as two equal doors at the top of the card.
 *
 * The sign-up route has existed from the start, but the only way to it was a
 * sentence of small print below the form, and people looking for it did not
 * find it. That footnote stays for anyone who reads to the bottom; this is for
 * everyone who does not.
 */
function AuthTabs({
  active,
  next,
}: {
  active: "login" | "signup";
  next: string;
}) {
  // Carrying `next` across keeps the destination someone was originally headed
  // for, so switching doors does not silently drop them on Home instead.
  const query =
    next && next !== "/home" ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <nav className="auth-tabs" aria-label="Account">
      <Link
        href={`/auth/login${query}`}
        className={active === "login" ? "active" : undefined}
        aria-current={active === "login" ? "page" : undefined}
      >
        Sign in
      </Link>
      <Link
        href={`/auth/signup${query}`}
        className={active === "signup" ? "active" : undefined}
        aria-current={active === "signup" ? "page" : undefined}
      >
        Create account
      </Link>
    </nav>
  );
}

/**
 * Brand marks, inline rather than fetched: `img-src` allows no remote origin,
 * and a provider button with a missing logo is exactly the kind of half-broken
 * that makes people distrust a sign-in page.
 */
function ProviderMark({ provider }: { provider: OAuthProvider }) {
  if (provider === "google")
    return (
      <svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true">
        <path
          fill="#4285f4"
          d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.2z"
        />
        <path
          fill="#34a853"
          d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.3v5.7C8 41.1 15.4 46 24 46z"
        />
        <path
          fill="#fbbc05"
          d="M11.7 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.3C2.8 17.1 2 20.5 2 24s.8 6.9 2.3 9.9l7.4-5.7z"
        />
        <path
          fill="#ea4335"
          d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8 6.9 4.3 14.1l7.4 5.7c1.7-5.2 6.6-9 12.3-9z"
        />
      </svg>
    );
  if (provider === "apple")
    return (
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M16.4 1.4c0 1.2-.4 2.2-1.3 3.1-1 1-2.1 1.6-3.4 1.5v-.4c0-1.1.5-2.2 1.3-3.1.5-.4 1-.8 1.7-1.1.6-.3 1.3-.4 1.8-.5.1.2.1.3.1.5zM21.1 17.2c-.3.8-.5 1.1-.9 1.8-.6 1-1.5 2.2-2.5 2.2-1 0-1.2-.6-2.5-.6s-1.6.6-2.5.6c-1.1 0-1.9-1.1-2.5-2.1-1.7-2.7-1.9-5.9-.8-7.6.7-1.2 1.9-1.9 3-1.9 1.1 0 1.9.6 2.8.6.9 0 1.5-.6 2.8-.6 1 0 2 .5 2.8 1.5-2.5 1.3-2.1 4.8.3 6.1z" />
      </svg>
    );
  if (provider === "github")
    return (
      <svg
        viewBox="0 0 16 16"
        width="15"
        height="15"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M8 0C3.6 0 0 3.6 0 8c0 3.5 2.3 6.5 5.5 7.6.4.1.5-.2.5-.4v-1.5c-2 .4-2.5-.5-2.7-.9-.1-.2-.5-.9-.8-1.1-.3-.2-.7-.5 0-.5.6 0 1.1.6 1.2.8.7 1.2 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8.6-.2 1.3-.3 2-.3s1.4.1 2 .3c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.5.8 1.3.8 2.1 0 3.1-1.9 3.8-3.6 4 .3.2.5.7.5 1.5v2.2c0 .2.1.5.5.4A8 8 0 0 0 16 8c0-4.4-3.6-8-8-8z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path fill="#f25022" d="M1 1h6.4v6.4H1z" />
      <path fill="#7fba00" d="M8.6 1H15v6.4H8.6z" />
      <path fill="#00a4ef" d="M1 8.6h6.4V15H1z" />
      <path fill="#ffb900" d="M8.6 8.6H15V15H8.6z" />
    </svg>
  );
}

/**
 * One button per identity provider this deployment has configured, and nothing
 * at all when it has configured none.
 *
 * Rendering a provider Supabase has not been told about is worse than hiding
 * it: the authorize endpoint answers with a bare JSON 400 on the Supabase
 * domain and no link back, so the person is not looking at a failed sign-in but
 * at a dead end. The allowlist lives in NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS.
 */
function ProviderButtons({
  intent,
  next,
  disabled,
  onError,
}: {
  intent: string;
  next: string;
  disabled?: boolean;
  onError: (error: unknown) => void;
}) {
  const { supabase } = useAuth();
  const redirectTo = useAuthRedirect(next);
  const [pending, setPending] = useState<OAuthProvider | null>(null);

  if (enabledOAuthProviders.length === 0) return null;

  const start = async (provider: OAuthProvider) => {
    if (!supabase) return;
    setPending(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, scopes: OAUTH_PROVIDER_SCOPES[provider] },
    });
    // On success the browser has already left for the provider, so getting a
    // result back at all means the handoff never happened.
    if (error) {
      setPending(null);
      onError(error);
    }
  };

  return (
    <>
      <div className="auth-providers">
        {enabledOAuthProviders.map((provider) => (
          <button
            key={provider}
            type="button"
            className="button secondary auth-provider"
            disabled={disabled || pending !== null}
            onClick={() => void start(provider)}
          >
            <ProviderMark provider={provider} />
            {pending === provider
              ? `Opening ${OAUTH_PROVIDER_LABELS[provider]}…`
              : `Continue with ${OAUTH_PROVIDER_LABELS[provider]}`}
          </button>
        ))}
      </div>
      <p className="auth-divider">
        <span>or {intent} with email</span>
      </p>
    </>
  );
}

/* -------------------------------------------------------------------------
 * Sign in
 * ---------------------------------------------------------------------- */

export function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabase, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState<{ tone: Tone; text: string }>(() => {
    const text = describeLinkError(searchParams.get("error"));
    return { tone: text ? "error" : "info", text };
  });
  // Set when sign-in failed because the address was never confirmed, which is
  // the one failure the person can fix from this screen.
  const [canResend, setCanResend] = useState(false);
  const [busy, setBusy] = useState(false);
  const cooldown = useCooldown();
  const next = safeNext(searchParams.get("next"));
  const redirectTo = useAuthRedirect(next);

  const fail = (error: unknown) => {
    const failure = describeAuthError(error as { message?: string });
    setCanResend(failure.reason === "unconfirmed");
    if (failure.retryAfterSeconds) cooldown.start(failure.retryAfterSeconds);
    setNote({
      tone: "error",
      text:
        failure.reason === "throttled" && failure.retryAfterSeconds
          ? `Too many requests. Try again in ${failure.retryAfterSeconds} seconds.`
          : failure.message,
    });
    setBusy(false);
  };

  const signInWithPassword = async () => {
    if (!supabase) return;
    if (!isValidEmail(email))
      return setNote({ tone: "error", text: "Enter a valid email address." });

    setBusy(true);
    setNote({ tone: "info", text: "" });
    setCanResend(false);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return fail(error);

    setNote({ tone: "success", text: "Signed in. Opening your space…" });
    // refresh() so the server components re-render against the cookie that was
    // just written, rather than the signed-out payload already in the cache.
    router.replace(next);
    router.refresh();
  };

  const sendMagicLink = async () => {
    if (!supabase) return;
    if (!isValidEmail(email))
      return setNote({ tone: "error", text: "Enter a valid email address." });

    setBusy(true);
    setNote({ tone: "info", text: "" });
    setCanResend(false);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Sign-in must not quietly create accounts. It did, which meant a typo
      // here produced a second empty household with no password and no name.
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
    });
    if (error) return fail(error);

    cooldown.start(60);
    setNote({
      tone: "success",
      text: "Check your email for a sign-in link. It is valid for one hour.",
    });
    setBusy(false);
  };

  const resendConfirmation = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) return fail(error);

    cooldown.start(60);
    setCanResend(false);
    setNote({
      tone: "success",
      text: "Confirmation email sent. Check your inbox, and your spam folder.",
    });
    setBusy(false);
  };

  if (status === "demo") return <DemoNotice title="No sign-in needed here" />;

  const waiting = cooldown.remaining > 0;

  return (
    <AuthShell>
      <span className="eyebrow">Welcome back</span>
      <h2>Sign in to your space</h2>
      <AuthTabs active="login" next={next} />
      <ProviderButtons
        intent="sign in"
        next={next}
        disabled={busy}
        onError={fail}
      />
      {/* A real form, so Enter submits and password managers offer to fill. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void signInWithPassword();
        }}
      >
        <label className="input-row">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <StatusNote tone={note.tone}>{note.text}</StatusNote>
        {canResend && (
          <button
            type="button"
            className="button secondary"
            disabled={busy || waiting}
            onClick={() => void resendConfirmation()}
          >
            <MailCheck size={15} />
            {waiting
              ? `Resend in ${cooldown.remaining}s`
              : "Resend the confirmation email"}
          </button>
        )}
        <button
          type="submit"
          className="button primary"
          disabled={busy || !email || !password}
        >
          Sign in
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={busy || !email || waiting}
          onClick={() => void sendMagicLink()}
        >
          {waiting
            ? `Email me a link in ${cooldown.remaining}s`
            : "Email me a magic link"}
        </button>
      </form>
      <p className="login-links">
        <Link
          href={`/auth/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
        >
          Forgot your password?
        </Link>
      </p>
      <p className="login-footnote">
        New to jarins? <Link href="/auth/signup">Create an account</Link>.
        Verified email required.
      </p>
    </AuthShell>
  );
}

/* -------------------------------------------------------------------------
 * Sign up
 * ---------------------------------------------------------------------- */

export function SignupView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabase, status } = useAuth();
  const [name, setName] = useState("");
  // An invitation mails the address it was sent to, so prefilling it saves a
  // retype and keeps the account matched to the invitation.
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [household, setHousehold] = useState("");
  const [note, setNote] = useState<{ tone: Tone; text: string }>({
    tone: "info",
    text: "",
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  // Two ways to hold an account: a password, or nothing to remember at all and
  // a link mailed each time. The link is offered first because it is the one
  // that cannot be forgotten, reused from another site, or typed into a
  // phishing page.
  const [method, setMethod] = useState<"link" | "password">("link");
  const cooldown = useCooldown();
  const hintId = useId();

  // Someone arriving from an invitation has to land back on it once confirmed,
  // or they finish sign-up with an account that never joined the household.
  const invitationToken = searchParams.get("invite");
  const next = invitationToken
    ? `/auth/invite/${invitationToken}`
    : safeNext(searchParams.get("next"));

  const redirectTo = useAuthRedirect(next);

  // Shown under the field as you type, rather than only after a failed submit.
  const passwordProblem = password ? validatePassword(password, email) : null;
  const mismatch = confirm.length > 0 && confirm !== password;

  const fail = (error: unknown) => {
    const failure = describeAuthError(error as { message?: string });
    if (failure.retryAfterSeconds) cooldown.start(failure.retryAfterSeconds);
    setNote({ tone: "error", text: failure.message });
    setBusy(false);
  };

  /** The metadata handle_new_user() reads to build the profile and household. */
  const signupMetadata = () => ({
    display_name: name.trim(),
    household_name: household.trim() || "My household",
  });

  /**
   * Sign up with no password at all: Supabase creates the account and mails a
   * link, and the same call signs an existing account in. That overlap is the
   * point — someone who cannot remember whether they already registered gets
   * the right outcome either way instead of "an account already uses that
   * email".
   */
  const submitLink = async () => {
    if (!supabase) return;
    if (!isValidEmail(email))
      return setNote({ tone: "error", text: "Enter a valid email address." });

    setBusy(true);
    setNote({ tone: "info", text: "" });

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectTo,
        // Ignored when the address already has an account, which is what we
        // want: a returning person keeps the household they already have.
        data: signupMetadata(),
      },
    });
    if (error) return fail(error);

    cooldown.start(60);
    setSent(true);
    setBusy(false);
  };

  const submitPassword = async () => {
    if (!supabase) return;
    if (!isValidEmail(email))
      return setNote({ tone: "error", text: "Enter a valid email address." });

    const problem = validatePassword(password, email);
    if (problem) return setNote({ tone: "error", text: problem });
    if (password !== confirm)
      return setNote({
        tone: "error",
        text: "The two passwords do not match.",
      });

    setBusy(true);
    setNote({ tone: "info", text: "" });

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirectTo, data: signupMetadata() },
    });
    if (error) return fail(error);

    // With email confirmation turned off Supabase signs the person in there and
    // then, so there is no link to wait for — sending them to the confirmation
    // screen would strand them.
    if (data.session) {
      router.push(next);
      return;
    }

    cooldown.start(60);
    setSent(true);
    setBusy(false);
  };

  /**
   * `resend` only re-sends a signup confirmation, and a passwordless sign-up
   * never produced one — asking for it there fails with "Signups not allowed
   * for otp". Each method has to resend the mail it actually sent.
   */
  const resend = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error } =
      method === "link"
        ? await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: {
              shouldCreateUser: true,
              emailRedirectTo: redirectTo,
              data: signupMetadata(),
            },
          })
        : await supabase.auth.resend({
            type: "signup",
            email: email.trim(),
            options: { emailRedirectTo: redirectTo },
          });
    if (error) return fail(error);
    cooldown.start(60);
    setNote({
      tone: "success",
      text: "Sent again. Check your spam folder too.",
    });
    setBusy(false);
  };

  if (status === "demo") return <DemoNotice title="No account needed here" />;

  if (sent) {
    const waiting = cooldown.remaining > 0;
    return (
      <AuthShell>
        <span className="eyebrow">One step left</span>
        <h2>Check your email</h2>
        <StatusNote tone="success">
          We sent a link to {email.trim()}. Open it and you are signed in.
          Anything already saved on this device moves into the account
          automatically.
          {method === "link" &&
            " If that address already has an account, the link simply signs you back into it."}
        </StatusNote>
        <StatusNote tone={note.tone}>{note.text}</StatusNote>
        <button
          className="button secondary"
          disabled={busy || waiting}
          onClick={() => void resend()}
        >
          <MailCheck size={15} />
          {waiting ? `Resend in ${cooldown.remaining}s` : "Send it again"}
        </button>
        <p className="login-footnote">
          Wrong address? <Link href="/auth/signup">Start again</Link>.
        </p>
      </AuthShell>
    );
  }

  const withPassword = method === "password";
  const waiting = cooldown.remaining > 0;

  return (
    <AuthShell>
      <span className="eyebrow">Get started</span>
      <h2>Create your space</h2>
      <AuthTabs active="signup" next={next} />
      <ProviderButtons
        intent="sign up"
        next={next}
        disabled={busy}
        onError={fail}
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void (withPassword ? submitPassword() : submitLink());
        }}
      >
        <label className="input-row">
          Your name
          <input
            autoComplete="name"
            placeholder="Faria"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="input-row">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        {/* Radios rather than buttons: this chooses between two states of the
            form, so a screen reader should hear it as a choice, and arrow keys
            should move through it. */}
        <fieldset className="auth-method">
          <legend>How you will sign in</legend>
          <label>
            <input
              type="radio"
              name="signup-method"
              checked={!withPassword}
              onChange={() => setMethod("link")}
            />
            <span>
              <strong>Email me a link each time</strong>
              <small>
                Nothing to remember. Best on a shared family device.
              </small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="signup-method"
              checked={withPassword}
              onChange={() => setMethod("password")}
            />
            <span>
              <strong>Set a password</strong>
              <small>Faster to sign in, and works without inbox access.</small>
            </span>
          </label>
        </fieldset>
        {withPassword && (
          <>
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              describedBy={hintId}
            />
            <p
              className={`field-hint ${passwordProblem ? "warn" : ""}`}
              id={hintId}
            >
              {passwordProblem ??
                `At least ${PASSWORD_MIN_LENGTH} characters. A phrase you will remember works well.`}
            </p>
            <PasswordField
              label="Repeat password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />
            {mismatch && (
              <p className="field-hint warn">These do not match yet.</p>
            )}
          </>
        )}
        <label className="input-row">
          Household name
          <input
            autoComplete="off"
            placeholder="Jarin household"
            value={household}
            onChange={(event) => setHousehold(event.target.value)}
          />
        </label>
        <StatusNote tone={note.tone}>{note.text}</StatusNote>
        <button
          type="submit"
          className="button primary"
          disabled={
            busy ||
            !email ||
            (withPassword
              ? !password || !confirm || !!passwordProblem || mismatch
              : waiting)
          }
        >
          {withPassword
            ? "Create account"
            : waiting
              ? `Send again in ${cooldown.remaining}s`
              : "Email me a sign-up link"}
        </button>
      </form>
      <p className="login-footnote">
        Already have one? <Link href="/auth/login">Sign in</Link>.
      </p>
    </AuthShell>
  );
}

/* -------------------------------------------------------------------------
 * Forgot password
 * ---------------------------------------------------------------------- */

export function ForgotPasswordView() {
  const searchParams = useSearchParams();
  const { supabase, status } = useAuth();
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [note, setNote] = useState<{ tone: Tone; text: string }>({
    tone: "info",
    text: "",
  });
  const [busy, setBusy] = useState(false);
  const cooldown = useCooldown();

  const submit = async () => {
    if (!supabase) return;
    if (!isValidEmail(email))
      return setNote({ tone: "error", text: "Enter a valid email address." });

    setBusy(true);
    setNote({ tone: "info", text: "" });

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`,
    });
    if (error) {
      const failure = describeAuthError(error);
      if (failure.retryAfterSeconds) cooldown.start(failure.retryAfterSeconds);
      setNote({ tone: "error", text: failure.message });
      setBusy(false);
      return;
    }

    cooldown.start(60);
    // Deliberately the same sentence whether or not the address exists: this
    // form is unauthenticated, so a distinct answer would confirm to anyone who
    // asks which family members have accounts.
    setNote({
      tone: "success",
      text: "If that address has an account, a reset link is on its way. It is valid for one hour.",
    });
    setBusy(false);
  };

  if (status === "demo") return <DemoNotice title="No passwords here" />;

  const waiting = cooldown.remaining > 0;

  return (
    <AuthShell>
      <span className="eyebrow">Account recovery</span>
      <h2>Reset your password</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="input-row">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <StatusNote tone={note.tone}>{note.text}</StatusNote>
        <button
          type="submit"
          className="button primary"
          disabled={busy || !email || waiting}
        >
          {waiting
            ? `Send again in ${cooldown.remaining}s`
            : "Email me a reset link"}
        </button>
      </form>
      <p className="login-links">
        <Link href="/auth/login">
          <ArrowLeft size={13} /> Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}

/* -------------------------------------------------------------------------
 * Choose a new password
 * ---------------------------------------------------------------------- */

/**
 * Reached only through a recovery link, which signs the person in before
 * redirecting here. The route is public so an expired link explains itself
 * instead of bouncing to /login, but the form itself renders only for a real
 * session — `status` comes from getUser(), which revalidates with the auth
 * server rather than trusting the cookie.
 */
export function ResetPasswordView() {
  const router = useRouter();
  const { supabase, status } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [note, setNote] = useState<{ tone: Tone; text: string }>({
    tone: "info",
    text: "",
  });
  const [busy, setBusy] = useState(false);
  const hintId = useId();

  const passwordProblem = password ? validatePassword(password) : null;
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async () => {
    if (!supabase) return;
    const problem = validatePassword(password);
    if (problem) return setNote({ tone: "error", text: problem });
    if (password !== confirm)
      return setNote({
        tone: "error",
        text: "The two passwords do not match.",
      });

    setBusy(true);
    setNote({ tone: "info", text: "" });

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setNote({ tone: "error", text: describeAuthError(error).message });
      setBusy(false);
      return;
    }

    setNote({ tone: "success", text: "Password changed. Opening Home…" });
    router.replace("/home");
    router.refresh();
  };

  if (status === "demo") return <DemoNotice title="No passwords here" />;

  if (status === "loading")
    return (
      <AuthShell>
        <span className="eyebrow">Account recovery</span>
        <h2>Checking your link…</h2>
      </AuthShell>
    );

  if (status === "signed-out")
    return (
      <AuthShell>
        <span className="eyebrow">Account recovery</span>
        <h2>That link has expired</h2>
        <StatusNote tone="error">
          Reset links are valid for one hour and work once. Ask for a new one.
        </StatusNote>
        <Link className="button primary" href="/auth/forgot-password">
          Send a new reset link
        </Link>
      </AuthShell>
    );

  return (
    <AuthShell>
      <span className="eyebrow">Account recovery</span>
      <h2>Choose a new password</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          describedBy={hintId}
        />
        <p
          className={`field-hint ${passwordProblem ? "warn" : ""}`}
          id={hintId}
        >
          {passwordProblem ??
            `At least ${PASSWORD_MIN_LENGTH} characters. A phrase you will remember works well.`}
        </p>
        <PasswordField
          label="Repeat new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {mismatch && <p className="field-hint warn">These do not match yet.</p>}
        <StatusNote tone={note.tone}>{note.text}</StatusNote>
        <button
          type="submit"
          className="button primary"
          disabled={
            busy || !password || !confirm || !!passwordProblem || mismatch
          }
        >
          Save new password
        </button>
      </form>
    </AuthShell>
  );
}

/* -------------------------------------------------------------------------
 * Household invitation
 * ---------------------------------------------------------------------- */

type InvitationDetails = {
  household_name: string;
  email: string;
  role: "adult" | "viewer";
  expires_at: string;
  is_available: boolean;
};

function InvitationView({ token }: { token?: string }) {
  const router = useRouter();
  const { supabase, user, status, refreshHousehold } = useAuth();
  const [details, setDetails] = useState<InvitationDetails>();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase || !token) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let active = true;
    void supabase
      .rpc("get_household_invitation", { invitation_token: token })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setMessage(error.message);
        else setDetails((data as InvitationDetails[] | null)?.[0]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [supabase, token]);

  const accept = async () => {
    if (!supabase || !token) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("accept_household_invitation", {
      invitation_token: token,
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    await refreshHousehold();
    router.push("/home");
    router.refresh();
  };

  const next = token ? `/auth/invite/${token}` : "/home";
  const signupHref = details
    ? `/auth/signup?invite=${encodeURIComponent(token ?? "")}&email=${encodeURIComponent(details.email)}`
    : `/auth/signup?next=${encodeURIComponent(next)}`;

  return (
    <AuthShell>
      <span className="eyebrow">Household invitation</span>
      <h2>{details ? `Join ${details.household_name}` : "Open invitation"}</h2>
      {loading ? (
        <p className="login-status">Checking this invitation…</p>
      ) : !details || !details.is_available ? (
        <p className="login-status" role="alert">
          {message ||
            "This invitation is invalid, expired, accepted, or revoked."}
        </p>
      ) : (
        <>
          <div className="invitation-summary">
            <Mail size={20} />
            <div>
              <strong>{details.email}</strong>
              <small>
                {details.role === "adult" ? "Adult collaborator" : "Viewer"} ·
                verified account required
              </small>
            </div>
          </div>
          {status === "signed-in" && user ? (
            <>
              <p className="login-status">
                Signed in as {user.email}. The invited address must match.
              </p>
              {message && (
                <p className="login-status" role="alert">
                  {message}
                </p>
              )}
              <button
                className="button primary"
                disabled={busy || !user.email_confirmed_at}
                onClick={() => void accept()}
              >
                <Check size={16} /> Accept and join
              </button>
              {!user.email_confirmed_at && (
                <p className="login-footnote">
                  Confirm your email before accepting.
                </p>
              )}
            </>
          ) : (
            <>
              <Link
                className="button primary"
                href={`/auth/login?next=${encodeURIComponent(next)}`}
              >
                Sign in to accept
              </Link>
              <Link className="button secondary" href={signupHref}>
                Create the invited account
              </Link>
            </>
          )}
        </>
      )}
    </AuthShell>
  );
}

/* -------------------------------------------------------------------------
 * Route entry
 * ---------------------------------------------------------------------- */

/**
 * Every /auth screen, dispatched here rather than through ModuleView.
 *
 * Routing them through the module router meant a sign-in form pulled the record
 * schema, the storage client and zod into its bundle for types and helpers it
 * never used. Unknown children never reach this — isKnownRoute rejects them on
 * the server with a real 404.
 */
export function AuthScreen({
  screen,
  rest,
}: {
  screen?: string;
  rest: string[];
}) {
  if (screen === "login") return <LoginView />;
  if (screen === "signup") return <SignupView />;
  if (screen === "forgot-password") return <ForgotPasswordView />;
  if (screen === "reset-password") return <ResetPasswordView />;
  if (screen === "invite") return <InvitationView token={rest[0]} />;
  return null;
}
