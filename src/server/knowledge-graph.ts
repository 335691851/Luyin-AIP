import "server-only";
import { z } from "zod";
import {
  ontologyGraph,
  instanceGraph,
  propertyConflict,
  safeGraphIri,
} from "@/lib/knowledge-graph";
import type {
  Binding,
  GraphData,
  GraphDetail,
  KnowledgeDocument,
  Ontology,
} from "@/lib/knowledge-graph";

const ontologySchema = z.object({
  ontology_id: z.string(),
  namespace: z.url(),
  classes: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().default(""),
        parent: z.string().optional(),
      }),
    )
    .max(500),
  object_properties: z
    .array(
      z.object({
        name: z.string(),
        domain: z.string(),
        range: z.string(),
        description: z.string().default(""),
      }),
    )
    .max(1000),
  datatype_properties: z
    .array(z.object({ name: z.string(), description: z.string().default("") }))
    .default([]),
  labels: z.record(z.string(), z.string()),
});
const documentsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.uuid(),
        filename: z.string(),
        status: z.string(),
        sha256: z.string(),
        ontology_version: z.string().nullable(),
      }),
    )
    .max(100),
});
const summarySchema = z.object({
  documents: z.number(),
  entities: z.number(),
  triples: z.number(),
  classes: z.number(),
  object_properties: z.number(),
});
const bindingsSchema = z.object({
  results: z.object({
    bindings: z
      .array(
        z.record(z.string(), z.object({ value: z.string(), type: z.string() })),
      )
      .max(15000),
  }),
});
type Metadata = {
  ontology: Ontology;
  documents: KnowledgeDocument[];
  summary: z.infer<typeof summarySchema>;
};
let metadata: { value: Metadata; expires: number } | undefined;
let metadataPending: Promise<Metadata> | undefined;
const graphs = new Map<string, { value: GraphData; expires: number }>();

async function request(path: string, query?: string) {
  const base = process.env.ONTORAG_BASE_URL;
  const key = process.env.ONTORAG_SERVICE_API_KEY;
  if (!base || !key) throw Error("ONTORAG_NOT_CONFIGURED");
  let response: Response;
  try {
    response = await fetch(new URL(path, base.replace(/\/?$/, "/")), {
      method: query ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(query ? { "Content-Type": "application/sparql-query" } : {}),
      },
      body: query,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("json"))
      throw Error();
    return await response.json();
  } catch {
    throw Error("ONTORAG_UNAVAILABLE");
  }
}

async function getMetadata(): Promise<Metadata> {
  if (metadata && metadata.expires > Date.now()) return metadata.value;
  if (metadataPending) return metadataPending;
  metadataPending = (async () => {
    try {
      const [rawOntology, rawDocuments, rawSummary] = await Promise.all([
        request("v1/ontology"),
        request("v1/documents?limit=100"),
        request("v1/knowledge-graph/summary"),
      ]);
      const value = {
        ontology: ontologySchema.parse(rawOntology),
        documents: documentsSchema.parse(rawDocuments).items,
        summary: summarySchema.parse(rawSummary),
      };
      safeGraphIri(value.ontology.namespace);
      metadata = { value, expires: Date.now() + 30000 };
      return value;
    } catch {
      throw Error("ONTORAG_UNAVAILABLE");
    } finally {
      metadataPending = undefined;
    }
  })();
  return metadataPending;
}

function validateScope(meta: Metadata, documentId: string) {
  if (documentId === "all") return;
  const doc = meta.documents.find((d) => d.id === documentId);
  if (!doc) throw Error("GRAPH_NOT_FOUND");
  if (
    doc.status !== "completed" ||
    doc.ontology_version !== meta.ontology.ontology_id
  )
    throw Error("GRAPH_DOCUMENT_NOT_READY");
}

async function select(documentId: string, query: string): Promise<Binding[]> {
  const path =
    documentId === "all"
      ? "v1/knowledge-graph/sparql"
      : `v1/documents/${documentId}/sparql`;
  try {
    return bindingsSchema.parse(await request(path, query)).results.bindings;
  } catch {
    throw Error("ONTORAG_UNAVAILABLE");
  }
}

// The live OntoRAG service caps each SELECT at 500 rows. Stable ordering and
// bounded pagination preserve the full graph instead of silently clipping it.
async function selectPaged(documentId: string, query: string, maxRows: number) {
  const rows: Binding[] = [];
  const pageSize = 500;
  const first = await select(documentId, `${query} LIMIT ${pageSize} OFFSET 0`);
  rows.push(...first);
  if (first.length < pageSize) return rows;
  for (let offset = pageSize; offset <= maxRows; offset += pageSize * 3) {
    const offsets = [offset, offset + pageSize, offset + pageSize * 2].filter(
      (n) => n <= maxRows,
    );
    const pages = await Promise.all(
      offsets.map((n) =>
        select(documentId, `${query} LIMIT ${pageSize} OFFSET ${n}`),
      ),
    );
    for (const page of pages) {
      rows.push(...page);
      if (rows.length > maxRows) throw Error("GRAPH_TOO_LARGE");
      if (page.length < pageSize) return rows;
    }
  }
  throw Error("GRAPH_TOO_LARGE");
}

// Callers must authorize the real user BEFORE invoking this administrative whole-graph reader.
export async function getKnowledgeGraph(
  view: "ontology" | "instances",
  documentId: string,
): Promise<GraphData> {
  const meta = await getMetadata();
  validateScope(meta, documentId);
  const cacheKey = `${view}/${documentId}`;
  const cached = graphs.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;
  let graph;
  if (view === "ontology") graph = ontologyGraph(meta.ontology);
  else {
    const ns = safeGraphIri(meta.ontology.namespace);
    const [nodes, edges] = await Promise.all([
      selectPaged(
        documentId,
        `SELECT ?s ?type ?label WHERE { ?s a ?type. FILTER(STRSTARTS(STR(?type), STR(${ns}))) OPTIONAL { ?s <http://www.w3.org/2000/01/rdf-schema#label> ?label } } ORDER BY ?s ?type ?label`,
        6000,
      ),
      selectPaged(
        documentId,
        `SELECT ?s ?p ?o WHERE { ?s ?p ?o. FILTER(isIRI(?s) && isIRI(?o) && STRSTARTS(STR(?p), STR(${ns}))) } ORDER BY ?s ?p ?o`,
        12000,
      ),
    ]);
    if (nodes.length > 6000 || edges.length > 12000)
      throw Error("GRAPH_TOO_LARGE");
    graph = instanceGraph(meta.ontology, nodes, edges);
  }
  const value: GraphData = {
    ...graph,
    view,
    documentId,
    ontologyId: meta.ontology.ontology_id,
    documents: meta.documents.map(({ sha256: _hash, ...d }) => d),
    types: meta.ontology.classes.map((c) => ({
      name: c.name,
      label: meta.ontology.labels[c.name] || c.name,
    })),
    summary: {
      documents: meta.summary.documents,
      entities: meta.summary.entities,
      triples: meta.summary.triples,
      classes: meta.summary.classes,
      objectProperties: meta.summary.object_properties,
    },
    loadedAt: new Date().toISOString(),
  };
  if (Buffer.byteLength(JSON.stringify(value)) > 4 * 1024 * 1024)
    throw Error("GRAPH_TOO_LARGE");
  if (graphs.size >= 24) graphs.delete(graphs.keys().next().value!);
  graphs.set(cacheKey, { value, expires: Date.now() + 30000 });
  return value;
}

export async function getKnowledgeDetail(
  documentId: string,
  iri: string,
): Promise<GraphDetail> {
  const safeIri = safeGraphIri(iri);
  const graph = await getKnowledgeGraph("instances", documentId);
  const node = graph.nodes.find((n) => n.id === iri);
  if (!node) throw Error("GRAPH_NOT_FOUND");
  const meta = await getMetadata();
  const ns = meta.ontology.namespace;
  const [props, evidenceRows] = await Promise.all([
    select(
      documentId,
      `SELECT ?p ?value WHERE { ${safeIri} ?p ?value. FILTER(isLiteral(?value)) } ORDER BY ?p ?value LIMIT 121`,
    ),
    select(
      documentId,
      `PREFIX p: <https://ontorag.org/provenance#> PREFIX oa: <http://www.w3.org/ns/oa#> SELECT DISTINCT ?chunk ?source ?quote WHERE { ${safeIri} p:hasMention ?mention. ?mention p:inChunk ?chunk; oa:hasTarget ?target. ?target oa:hasSource ?source; oa:hasSelector ?selector. ?selector oa:exact ?quote } ORDER BY ?chunk ?quote LIMIT 61`,
    ),
  ]);
  const grouped = new Map<string, Set<string>>();
  for (const row of props.slice(0, 120)) {
    const values = grouped.get(row.p.value) || new Set<string>();
    values.add(row.value.value);
    grouped.set(row.p.value, values);
  }
  const properties = [...grouped.entries()].map(([property, values]) => ({
    iri: property,
    label:
      property === "http://www.w3.org/2000/01/rdf-schema#label"
        ? "名称"
        : meta.ontology.datatype_properties.find(
            (p) => ns + p.name === property,
          )?.description ||
          property.split(/[\/#]/).at(-1) ||
          property,
    values: [...values],
  }));
  const evidence = evidenceRows.slice(0, 60).map((row) => {
    const hash = row.source.value.match(/\/file\/doc_([a-f0-9]{16})$/)?.[1];
    const doc = hash
      ? meta.documents.find((d) => d.sha256.startsWith(hash))
      : undefined;
    return {
      documentId: doc?.id || null,
      filename: doc?.filename || "出处文件尚未映射",
      chunk: row.chunk.value,
      quote: row.quote.value,
      page:
        decodeURIComponent(row.chunk.value).match(/#p([0-9]+)#/)?.[1] || null,
    };
  });
  return {
    node,
    properties,
    evidence,
    propertiesTruncated: props.length > 120,
    evidenceTruncated: evidenceRows.length > 60,
    conflict: propertyConflict(node.type, properties),
    loadedAt: new Date().toISOString(),
  };
}
