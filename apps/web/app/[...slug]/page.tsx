import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ModuleView } from "@/components/module-view";
import { AuthScreen } from "@/components/auth-views";
import { isKnownRoute } from "@/lib/modules";

export default async function DynamicPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  // Rejecting here rather than in the client component means the response
  // actually carries a 404 status, not a 200 with not-found content in it.
  if (!isKnownRoute(slug)) notFound();

  // The signed-out screens carry their own full-page layout, and none of the
  // chrome is reachable without a session. Deciding here rather than inside
  // AppShell means the shell — and the message centre, quick capture and
  // navigation it pulls with it — is never sent to a visitor looking at a
  // sign-in form.
  if (slug[0] === "auth")
    return <AuthScreen screen={slug[1]} rest={slug.slice(2)} />;

  return (
    <AppShell>
      <ModuleView slug={slug} />
    </AppShell>
  );
}
