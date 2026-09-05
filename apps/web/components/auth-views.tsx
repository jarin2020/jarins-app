"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, MailCheck } from "lucide-react";
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

  const redirectTo = useMemo(
    () =>
      typeof window === "undefined"
        ? ""
        : `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
    [next],
  );

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
          href={`/forgot${email ? `?email=${encodeURIComponent(email)}` : ""}`}
        >
          Forgot your password?
        </Link>
      </p>
      <p className="login-footnote">
        New to jarins? <Link href="/signup">Create an account</Link>. Verified
        email required.
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
  const cooldown = useCooldown();
  const hintId = useId();

  // Someone arriving from an invitation has to land back on it once confirmed,
  // or they finish sign-up with an account that never joined the household.
  const invitationToken = searchParams.get("invite");
  const next = invitationToken
    ? `/invite/${invitationToken}`
    : safeNext(searchParams.get("next"));

  const redirectTo =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  // Shown under the field as you type, rather than only after a failed submit.
  const passwordProblem = password ? validatePassword(password, email) : null;
  const mismatch = confirm.length > 0 && confirm !== password;

  const fail = (error: unknown) => {
    const failure = describeAuthError(error as { message?: string });
    if (failure.retryAfterSeconds) cooldown.start(failure.retryAfterSeconds);
    setNote({ tone: "error", text: failure.message });
    setBusy(false);
  };

  const submit = async () => {
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
      options: {
        emailRedirectTo: redirectTo,
        // handle_new_user() reads both of these to build the profile and the
        // household in the same transaction as the account.
        data: {
          display_name: name.trim(),
          household_name: household.trim() || "My household",
        },
      },
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

  const resend = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.resend({
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
        <h2>Confirm your email</h2>
        <StatusNote tone="success">
          We sent a confirmation link to {email.trim()}. Open it and you are
          signed in. Anything already saved on this device moves into the
          account automatically.
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
          Wrong address? <Link href="/signup">Start again</Link>.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <span className="eyebrow">Get started</span>
      <h2>Create your space</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
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
        {mismatch && <p className="field-hint warn">These do not match yet.</p>}
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
            !password ||
            !confirm ||
            !!passwordProblem ||
            mismatch
          }
        >
          Create account
        </button>
      </form>
      <p className="login-footnote">
        Already have one? <Link href="/login">Sign in</Link>.
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
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
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
        <Link href="/login">
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
        <Link className="button primary" href="/forgot">
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
