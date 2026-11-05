import { redirect } from "next/navigation";
import Platform from "@/components/platform";
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const page = slug?.[0] || "reports";
  if (page === "overview" || page === "ask") redirect("/operation/reports");
  if (page === "settings") redirect("/admin/integrations");
  if (page === "semantic") redirect("/admin/semantic");
  return <Platform area="operation" page={page} />;
}
