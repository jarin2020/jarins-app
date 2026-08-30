import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ModuleView } from "@/components/module-view";
import { isKnownRoute } from "@/lib/modules";

export default async function DynamicPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  // Rejecting here rather than in the client component means the response
  // actually carries a 404 status, not a 200 with not-found content in it.
  if (!isKnownRoute(slug[0])) notFound();
  return (
    <AppShell>
      <ModuleView slug={slug} />
    </AppShell>
  );
}
