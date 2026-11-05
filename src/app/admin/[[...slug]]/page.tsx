import AdminConsole from "@/components/admin-console";
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  return <AdminConsole page={slug?.[0] || "integrations"} />;
}
