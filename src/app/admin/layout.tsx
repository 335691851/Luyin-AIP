import WorkspaceLayout from "@/server/workspace-layout";
import { requirePageAccess } from "@/server/page-access";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageAccess("admin", "integrations");
  return <WorkspaceLayout>{children}</WorkspaceLayout>;
}
