import "server-only";
import { getKnowledgeGraph, getKnowledgeDetail } from "./knowledge-graph";
// Only the company's explicitly referenced documents are searched, never the whole graph.
export async function governanceKnowledge(
  documentIds: string[],
  question: string,
) {
  const docs = [...new Set(documentIds)]
    .filter((id) => /^[a-f0-9-]{36}$/.test(id))
    .slice(0, 10);
  const terms = question.replace(/[\s，。？、：]/g, "").match(/.{2}/g) || [];
  const graphs = await Promise.all(
    docs.map((id) => getKnowledgeGraph("instances", id)),
  );
  const candidates = graphs
    .flatMap((g) =>
      g.nodes.map((n) => ({
        node: n,
        doc: g.documentId,
        score: terms.filter((t) =>
          (n.label + (n.description || "")).includes(t),
        ).length,
      })),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  const details = await Promise.all(
    candidates.map((c) => getKnowledgeDetail(c.doc, c.node.id)),
  );
  return details.map((d) => ({
    label: d.node.label,
    properties: d.properties.slice(0, 10).map((p) => ({
      ...p,
      values: p.values.slice(0, 3).map((v) => v.slice(0, 600)),
    })),
    evidence: d.evidence
      .slice(0, 4)
      .map((e) => ({ ...e, quote: e.quote.slice(0, 2000) })),
  }));
}
