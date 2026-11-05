import { demoMode, integrationStatus } from "@/server/config";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return Response.json({
    mode: demoMode() ? "demo" : "live",
    integrations: integrationStatus(),
    model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
  });
}
