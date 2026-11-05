import "server-only";
import { redirect } from "next/navigation";
import { demoMode } from "./config";
import { identity } from "./auth";
import { can, landing, pagePermission } from "@/lib/access";

export async function requirePageAccess(area: string, page: string) {
  if (demoMode()) return;
  let user;
  try {
    user = await identity();
  } catch (error) {
    if (
      error instanceof Error &&
      ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message)
    )
      redirect("/login");
    throw error;
  }
  if (!can(user.access, pagePermission(area, page)))
    redirect(landing(user.access));
}
