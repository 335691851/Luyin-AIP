export type Ontology = {
  ontology_id: string;
  namespace: string;
  classes: { name: string; description: string; parent?: string }[];
  object_properties: {
    name: string;
    domain: string;
    range: string;
    description: string;
  }[];
  datatype_properties: { name: string; description: string }[];
  labels: Record<string, string>;
};
export type GraphNode = {
  id: string;
  label: string;
  type: string;
  typeLabel: string;
  description?: string;
  parent?: string;
};
export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  predicate: string;
  label: string;
  description: string;
  inherited?: boolean;
};
export type KnowledgeDocument = {
  id: string;
  filename: string;
  status: string;
  sha256: string;
  ontology_version: string | null;
};
export type GraphData = {
  view: "ontology" | "instances";
  documentId: string;
  ontologyId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  documents: Omit<KnowledgeDocument, "sha256">[];
  types: { name: string; label: string }[];
  summary: {
    documents: number;
    entities: number;
    triples: number;
    classes: number;
    objectProperties: number;
  };
  loadedAt: string;
};
export type GraphDetail = {
  node: GraphNode;
  properties: { iri: string; label: string; values: string[] }[];
  evidence: {
    documentId: string | null;
    filename: string;
    chunk: string;
    quote: string;
    page: string | null;
  }[];
  propertiesTruncated: boolean;
  evidenceTruncated: boolean;
  conflict: boolean;
  loadedAt: string;
};
export type Binding = Record<string, { value: string; type: string }>;

export function ontologyGraph(ontology: Ontology) {
  const nodes: GraphNode[] = ontology.classes.map((c) => ({
    id: ontology.namespace + c.name,
    label: ontology.labels[c.name] || c.name,
    type: c.name,
    typeLabel: "本体类",
    description: c.description,
    parent: c.parent,
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges: GraphEdge[] = ontology.object_properties.map((p) => ({
    id: ontology.namespace + p.name,
    source: ontology.namespace + p.domain,
    target: ontology.namespace + p.range,
    predicate: p.name,
    label: p.description,
    description: p.description,
  }));
  for (const c of ontology.classes)
    if (c.parent)
      edges.push({
        id: `${ontology.namespace}${c.name}/subClassOf`,
        source: ontology.namespace + c.name,
        target: ontology.namespace + c.parent,
        predicate: "subClassOf",
        label: "继承自",
        description: "类型继承关系",
        inherited: true,
      });
  return {
    nodes,
    edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
}

export function instanceGraph(
  ontology: Ontology,
  nodeRows: Binding[],
  edgeRows: Binding[],
) {
  const classes = new Map(
    ontology.classes.map((c) => [ontology.namespace + c.name, c]),
  );
  const nodes = new Map<string, GraphNode>();
  for (const row of nodeRows) {
    const c = classes.get(row.type?.value);
    if (!c || row.s?.type !== "uri") continue;
    const old = nodes.get(row.s.value);
    if (!old || (c.parent && old.type === c.parent))
      nodes.set(row.s.value, {
        id: row.s.value,
        label:
          row.label?.value || row.s.value.split("/").at(-1) || "未命名实体",
        type: c.name,
        typeLabel: ontology.labels[c.name] || c.name,
      });
  }
  const properties = new Map(
    ontology.object_properties.map((p) => [ontology.namespace + p.name, p]),
  );
  const edges = new Map<string, GraphEdge>();
  for (const row of edgeRows) {
    const p = properties.get(row.p?.value);
    if (!p || !nodes.has(row.s?.value) || !nodes.has(row.o?.value)) continue;
    const id = JSON.stringify([row.s.value, row.p.value, row.o.value]);
    edges.set(id, {
      id,
      source: row.s.value,
      target: row.o.value,
      predicate: p.name,
      label: p.description,
      description: p.description,
    });
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export function graphDegrees(edges: GraphEdge[]) {
  const counts = new Map<string, number>();
  for (const edge of edges)
    for (const id of [edge.source, edge.target])
      counts.set(id, (counts.get(id) || 0) + 1);
  return counts;
}

export function visibleGraph(
  data: Pick<GraphData, "nodes" | "edges">,
  options: {
    search: string;
    type: string;
    isolated: boolean;
    focus: string | null;
    limit: number;
  },
) {
  const query = options.search.trim().toLocaleLowerCase();
  const degrees = graphDegrees(data.edges);
  const matchingEdges = data.edges.filter(
    (e) =>
      query && `${e.predicate} ${e.label}`.toLocaleLowerCase().includes(query),
  );
  const edgeMatches = new Set(
    matchingEdges.flatMap((e) => [e.source, e.target]),
  );
  const neighbors = options.focus
    ? new Set([
        options.focus,
        ...data.edges
          .filter(
            (e) => e.source === options.focus || e.target === options.focus,
          )
          .flatMap((e) => [e.source, e.target]),
      ])
    : null;
  const matches = data.nodes
    .filter(
      (n) =>
        (!options.type || n.type === options.type) &&
        (options.isolated || degrees.has(n.id)) &&
        (!neighbors || neighbors.has(n.id)) &&
        (!query ||
          `${n.label} ${n.type} ${n.typeLabel}`
            .toLocaleLowerCase()
            .includes(query) ||
          edgeMatches.has(n.id)),
    )
    .sort(
      (a, b) =>
        (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0) ||
        a.label.localeCompare(b.label, "zh-CN"),
    );
  const nodes = matches.slice(0, options.limit);
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: data.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    matches,
    truncated: matches.length > nodes.length,
    degrees,
  };
}

export function propertyConflict(
  type: string,
  properties: GraphDetail["properties"],
) {
  return (
    type === "PolicyClause" &&
    properties.some(
      (p) =>
        /\/(clauseNumber|clauseText)$/.test(p.iri) &&
        new Set(p.values).size > 1,
    )
  );
}

export function safeGraphIri(value: string) {
  if (/[\s<>"{}|\\^]/.test(value) || value.includes(String.fromCharCode(96)))
    throw Error("GRAPH_INVALID_INPUT");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw Error("GRAPH_INVALID_INPUT");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw Error("GRAPH_INVALID_INPUT");
  return `<${value}>`;
}
