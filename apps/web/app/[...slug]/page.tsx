import { AppShell } from "@/components/app-shell";
import { ModuleView } from "@/components/module-view";

export default async function DynamicPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <AppShell><ModuleView slug={slug} /></AppShell>;
}
