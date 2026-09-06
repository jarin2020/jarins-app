import type { ProfileAccent } from "@/lib/account-profile";

/**
 * A person's photo, or their initials in their accent when there isn't one.
 *
 * Deliberately a plain <img>. next/image would route a private, per-viewer,
 * short-lived signed URL through the optimizer — a second host that would need
 * the Supabase origin in remotePatterns and would cache a household photo
 * outside the bucket that is meant to hold it. The sizes here are 32-88px, so
 * there is nothing for an optimizer to save.
 */
export function ProfileAvatar({
  url,
  initials,
  accent = "green",
  size = "md",
  className = "",
  alt = "",
}: {
  url?: string | null;
  initials: string;
  accent?: ProfileAccent;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  alt?: string;
}) {
  const classes =
    `profile-avatar size-${size} accent-${accent} ${className}`.trim();
  if (url)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- see the note above
      <img className={`${classes} has-photo`} src={url} alt={alt} />
    );
  return (
    <span className={classes} aria-hidden={alt ? undefined : "true"}>
      {initials}
    </span>
  );
}
