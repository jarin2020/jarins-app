import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function NotFound() {
  return (
    <AppShell>
      <section className="empty-state">
        <h2>That page does not exist</h2>
        <p>
          The address may have changed, or the link may have been mistyped.
          Nothing has been lost.
        </p>
        <Link className="button primary" href="/today">
          Back to Today
        </Link>
      </section>
    </AppShell>
  );
}
