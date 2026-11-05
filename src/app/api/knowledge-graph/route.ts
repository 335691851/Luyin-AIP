import { z } from "zod";
import { demoMode } from "@/server/config";
import { identity, safeError } from "@/server/auth";
import {
  getKnowledgeGraph,
  getKnowledgeDetail,
} from "@/server/knowledge-graph";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    if (demoMode()) throw Error("GRAPH_REQUIRES_REAL_LOGIN");
    const user = await identity();
    // No multi-tenant document bindings exist yet: whole-service graphs are admin-only.
    if (!user.admin) throw Error("FORBIDDEN");
    const q = new URL(request.url).searchParams;
    const input = z
      .object({
        view: z.enum(["ontology", "instances"]).default("ontology"),
        document: z.union([z.literal("all"), z.uuid()]).default("all"),
        iri: z.string().max(1500).optional(),
      })
      .safeParse({
        view: q.get("view") || undefined,
        document: q.get("document") || undefined,
        iri: q.get("iri") || undefined,
      });
    if (!input.success) throw Error("GRAPH_INVALID_INPUT");
    const data = input.data.iri
      ? await getKnowledgeDetail(input.data.document, input.data.iri)
      : await getKnowledgeGraph(input.data.view, input.data.document);
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return safeError(error);
  }
}
