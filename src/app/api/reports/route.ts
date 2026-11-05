import { getSales } from "@/server/reports";
import { safeError } from "@/server/auth";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    return Response.json(
      await getSales({
        month: new URL(req.url).searchParams.get("month") || undefined,
        company: new URL(req.url).searchParams.get("company") || undefined,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
}
