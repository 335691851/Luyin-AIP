import "server-only";
import { getKnowledgeGraph, getKnowledgeDetail } from "./knowledge-graph";
// Only the company's explicitly referenced documents are searched, never the whole graph.
async function retrieveKnowledge(documentIds: string[], question: string) {
  const docs = [...new Set(documentIds)]
    .filter((id) => /^[a-f0-9-]{36}$/.test(id))
    .slice(0, 10);
  const terms = question.replace(/[\s，。？、：]/g, "").match(/.{2}/g) || [];
  const graphs = (
    await Promise.allSettled(
      docs.map((id) => getKnowledgeGraph("instances", id)),
    )
  ).flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
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
  const details = (
    await Promise.allSettled(
      candidates.map((c) => getKnowledgeDetail(c.doc, c.node.id)),
    )
  ).flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  return details.map((d) => ({
    label: d.node.label,
    properties: d.properties.slice(0, 10).map((p) => ({
      ...p,
      values: p.values.slice(0, 3).map((v) => v.slice(0, 600)),
    })),
    evidence: d.evidence
      .slice(0, 4)
      .map((e) => ({ ...e, quote: e.quote.slice(0, 800) })),
  }));
}

// References are scoped by company archive document IDs, never by question alone.
// In-flight deduplication avoids repeating the same two remote lookup stages.
const cache = new Map<
  string,
  { expires: number; value: ReturnType<typeof retrieveKnowledge> }
>();
export function governanceKnowledge(documentIds: string[], question: string) {
  const key = JSON.stringify([
    [...new Set(documentIds)].sort(),
    question.trim(),
  ]);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = retrieveKnowledge(documentIds, question);
  const entry = { expires: Date.now() + 180000, value };
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  cache.set(key, entry);
  value
    .then((result) => {
      if (!result.length && cache.get(key) === entry) cache.delete(key);
    })
    .catch(() => {
      if (cache.get(key) === entry) cache.delete(key);
    });
  return value;
}
