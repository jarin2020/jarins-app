/**
 * Which third-party identity providers this deployment offers, and what to call
 * them on screen.
 *
 * A provider button that Supabase has not been told about does not fail
 * politely, and does not come back: /auth/v1/authorize answers
 * `{"code":400,...,"msg":"Unsupported provider: provider is not enabled"}` as a
 * raw JSON body, on the Supabase domain, with no way back to the app. So the
 * buttons are opt-in — the build declares the providers it has actually
 * configured in `NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS`, and nothing renders when it
 * is unset.
 *
 * Pure apart from the one env read at the bottom, so the parsing is testable
 * without a project or a browser.
 */

export const OAUTH_PROVIDERS = ["google", "apple", "github", "azure"] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/**
 * `azure` is Supabase's name for Microsoft accounts; nobody outside the
 * dashboard calls it that, so the label does not.
 */
export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: "Google",
  apple: "Apple",
  github: "GitHub",
  azure: "Microsoft",
};

/**
 * Extra scopes to request per provider. Apple only returns a name on the very
 * first authorization and only when `name` is asked for, so a missed scope here
 * means every Apple account arrives permanently nameless.
 */
export const OAUTH_PROVIDER_SCOPES: Partial<Record<OAuthProvider, string>> = {
  google: "email profile",
  apple: "email name",
  github: "user:email",
  azure: "email openid profile",
};

function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Reads the comma-separated allowlist. Order is preserved so the deployment
 * decides which provider sits at the top of the card; unknown names are dropped
 * rather than rendered, because the only thing a typo could produce is a button
 * that always fails.
 */
export function parseOAuthProviders(
  value: string | undefined,
): OAuthProvider[] {
  if (!value) return [];
  const seen = new Set<OAuthProvider>();
  for (const entry of value.split(",")) {
    const name = entry.trim().toLowerCase();
    if (isOAuthProvider(name)) seen.add(name);
  }
  return [...seen];
}

/**
 * NEXT_PUBLIC_* is inlined at build time, so this must be a static member
 * expression — a computed lookup resolves to undefined in the browser bundle.
 */
export const enabledOAuthProviders = parseOAuthProviders(
  process.env.NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS,
);
