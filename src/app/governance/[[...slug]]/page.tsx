import { redirect } from "next/navigation";
import Platform from "@/components/platform";
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const p = await params;
  if (p.slug?.[0] === "settings") redirect("/admin/integrations");
  if (p.slug?.[0] === "semantic") redirect("/admin/semantic");
  return <Platform area="governance" page={p.slug?.[0] || "overview"} />;
}
