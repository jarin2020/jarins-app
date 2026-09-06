/**
 * The networks a profile can link out to, and the rules for turning what
 * somebody pastes into one of them.
 *
 * The vocabulary lives here rather than in the database so that adding a
 * network is not a migration — the column only checks that a link is an object
 * with a short platform slug and an http(s) URL. An id that this build no
 * longer knows falls back to the generic website glyph rather than breaking the
 * row, which is what makes that split safe.
 *
 * Brand marks for every id are in components/brand-glyph.tsx.
 */

export const MAX_PROFILE_LINKS = 10;

export type ProfilePlatform = {
  id: string;
  label: string;
  /** Hosts that identify the platform, matched with their subdomains. */
  hosts: string[];
  /** Placeholder for the URL field once this platform is chosen. */
  example: string;
};

export const profilePlatforms = [
  {
    id: "linkedin",
    label: "LinkedIn",
    hosts: ["linkedin.com"],
    example: "https://www.linkedin.com/in/your-name",
  },
  {
    id: "xing",
    label: "Xing",
    hosts: ["xing.com"],
    example: "https://www.xing.com/profile/Your_Name",
  },
  {
    id: "github",
    label: "GitHub",
    hosts: ["github.com", "github.io"],
    example: "https://github.com/your-name",
  },
  {
    id: "gitlab",
    label: "GitLab",
    hosts: ["gitlab.com"],
    example: "https://gitlab.com/your-name",
  },
  {
    id: "x",
    label: "X",
    hosts: ["x.com", "twitter.com"],
    example: "https://x.com/your-name",
  },
  {
    id: "instagram",
    label: "Instagram",
    hosts: ["instagram.com"],
    example: "https://www.instagram.com/your-name",
  },
  {
    id: "facebook",
    label: "Facebook",
    hosts: ["facebook.com", "fb.com", "fb.me"],
    example: "https://www.facebook.com/your-name",
  },
  {
    id: "threads",
    label: "Threads",
    hosts: ["threads.net", "threads.com"],
    example: "https://www.threads.com/@your-name",
  },
  {
    id: "bluesky",
    label: "Bluesky",
    hosts: ["bsky.app"],
    example: "https://bsky.app/profile/your-name",
  },
  {
    id: "mastodon",
    label: "Mastodon",
    hosts: [
      "mastodon.social",
      "mastodon.online",
      "mastodon.world",
      "mstdn.social",
      "chaos.social",
      "troet.cafe",
    ],
    example: "https://mastodon.social/@your-name",
  },
  {
    id: "youtube",
    label: "YouTube",
    hosts: ["youtube.com", "youtu.be"],
    example: "https://www.youtube.com/@your-channel",
  },
  {
    id: "tiktok",
    label: "TikTok",
    hosts: ["tiktok.com"],
    example: "https://www.tiktok.com/@your-name",
  },
  {
    id: "twitch",
    label: "Twitch",
    hosts: ["twitch.tv"],
    example: "https://www.twitch.tv/your-name",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    hosts: ["wa.me", "whatsapp.com"],
    example: "https://wa.me/491510000000",
  },
  {
    id: "telegram",
    label: "Telegram",
    hosts: ["t.me", "telegram.me", "telegram.org"],
    example: "https://t.me/your-name",
  },
  {
    id: "signal",
    label: "Signal",
    hosts: ["signal.me", "signal.group"],
    example: "https://signal.me/#p/+491510000000",
  },
  {
    id: "discord",
    label: "Discord",
    hosts: ["discord.com", "discord.gg"],
    example: "https://discord.com/users/your-id",
  },
  {
    id: "reddit",
    label: "Reddit",
    hosts: ["reddit.com"],
    example: "https://www.reddit.com/user/your-name",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    hosts: ["pinterest.com", "pinterest.de", "pin.it"],
    example: "https://www.pinterest.de/your-name",
  },
  {
    id: "behance",
    label: "Behance",
    hosts: ["behance.net"],
    example: "https://www.behance.net/your-name",
  },
  {
    id: "dribbble",
    label: "Dribbble",
    hosts: ["dribbble.com"],
    example: "https://dribbble.com/your-name",
  },
  {
    id: "medium",
    label: "Medium",
    hosts: ["medium.com"],
    example: "https://medium.com/@your-name",
  },
  {
    id: "substack",
    label: "Substack",
    hosts: ["substack.com"],
    example: "https://your-name.substack.com",
  },
  {
    id: "spotify",
    label: "Spotify",
    hosts: ["spotify.com", "spotify.link"],
    example: "https://open.spotify.com/user/your-id",
  },
  {
    id: "strava",
    label: "Strava",
    hosts: ["strava.com"],
    example: "https://www.strava.com/athletes/your-id",
  },
  {
    id: "website",
    label: "Website",
    hosts: [],
    example: "https://your-site.example",
  },
] as const satisfies readonly ProfilePlatform[];

export type ProfilePlatformId = (typeof profilePlatforms)[number]["id"];

export type ProfileLink = {
  platform: ProfilePlatformId;
  url: string;
  label?: string;
};

const byId = new Map<string, ProfilePlatform>(
  profilePlatforms.map((platform) => [platform.id, platform]),
);

export function profilePlatform(id: string): ProfilePlatform {
  return byId.get(id) ?? byId.get("website")!;
}

/** Whether an id is one this build knows how to draw. */
export function isProfilePlatformId(id: string): id is ProfilePlatformId {
  return byId.has(id);
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Which network a URL belongs to. Unrecognised hosts are a website, not an
 * error — a personal domain is a perfectly good thing to link to, and the
 * person can still correct the choice by hand.
 */
export function detectProfilePlatform(url: string): ProfilePlatformId {
  const host = hostnameOf(url);
  if (!host) return "website";
  const match = profilePlatforms.find((platform) =>
    platform.hosts.some(
      (candidate) => host === candidate || host.endsWith(`.${candidate}`),
    ),
  );
  if (match) return match.id;
  // Mastodon is federated: there is no canonical host, only some thousands of
  // them. The larger instances are listed above; these two prefixes cover most
  // of the rest, and anything else is a website until the person says otherwise.
  if (/^(mastodon|mstdn)\./.test(host)) return "mastodon";
  return "website";
}

/**
 * Accepts what people actually paste — `linkedin.com/in/faria` as readily as
 * the full URL — and returns a normalised absolute one, or null if it cannot
 * be made into an http(s) address. Assuming https for a bare host is the whole
 * point: prepending it is also what turns `javascript:` and other schemes into
 * something that fails to parse rather than something that survives.
 */
export function normalizeProfileUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // Credentials in a URL are never a profile link and are how
  // `https://linkedin.com@evil.example` reads as LinkedIn to a person scanning
  // it. Refusing them is also what stops `mailto:name@host` from surviving the
  // https prefix above as a user, a password and somebody else's host.
  if (url.username || url.password) return null;
  // A hostname without a dot is a typo or an intranet name, not a profile.
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) return null;
  const normalized = url.toString();
  return normalized.length <= 300 ? normalized : null;
}

/** What to show for a link: the person's own label, else the network's name. */
export function profileLinkLabel(link: ProfileLink) {
  return link.label?.trim() || profilePlatform(link.platform).label;
}

/** `https://www.linkedin.com/in/faria/` → `linkedin.com/in/faria`. */
export function profileLinkHandle(link: ProfileLink) {
  return link.url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

/**
 * Reads the `links` column back. Written defensively because the column is
 * jsonb and older rows, hand-edited rows and rows from a build that knew a
 * network this one does not all have to render rather than throw.
 */
export function parseProfileLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  const links: ProfileLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.url !== "string") continue;
    const url = normalizeProfileUrl(row.url);
    if (!url) continue;
    const platform =
      typeof row.platform === "string" && isProfilePlatformId(row.platform)
        ? row.platform
        : detectProfilePlatform(url);
    const label =
      typeof row.label === "string" && row.label.trim()
        ? row.label.trim().slice(0, 40)
        : undefined;
    links.push({ platform, url, ...(label ? { label } : {}) });
    if (links.length === MAX_PROFILE_LINKS) break;
  }
  return links;
}
