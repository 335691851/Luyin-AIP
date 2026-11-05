import "server-only";
import { redirect } from "next/navigation";
import { identity } from "./auth";
import { demoMode } from "./config";
import { WorkspaceSession } from "@/components/workspace-session";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let initial = null;
  if (!demoMode()) {
    try {
      const user = await identity();
      initial = {
        session: user.access,
        users: user.admin ? [user.access.user] : [],
        roles: user.admin ? [user.access.role] : [],
        editable: false,
        previewAvailable: false,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message)
      )
        redirect("/login");
      throw error;
    }
  }
  return <WorkspaceSession initial={initial}>{children}</WorkspaceSession>;
}
