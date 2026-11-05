import { describe, it, expect } from "vitest";
import {
  ontologyGraph,
  instanceGraph,
  visibleGraph,
  safeGraphIri,
  propertyConflict,
} from "../src/lib/knowledge-graph";
import type { Ontology, Binding } from "../src/lib/knowledge-graph";
const ns = "https://example.org/ontology/";
const ontology: Ontology = {
  ontology_id: "test",
  namespace: ns,
  classes: [
    { name: "Policy", description: "制度" },
    { name: "PolicyClause", description: "条款", parent: "Policy" },
    { name: "Risk", description: "风险" },
  ],
  object_properties: [
    {
      name: "requires",
      domain: "PolicyClause",
      range: "Risk",
      description: "防范风险",
    },
  ],
  datatype_properties: [],
  labels: { Policy: "制度", PolicyClause: "制度条款", Risk: "风险" },
};
describe("knowledge graph boundaries", () => {
  it("distinguishes inheritance from object relations", () => {
    const g = ontologyGraph(ontology);
    expect(g.nodes).toHaveLength(3);
    expect(g.edges).toHaveLength(2);
    expect(g.edges.filter((e) => e.inherited)).toHaveLength(1);
  });
  it("deduplicates domain entities and excludes provenance and unknown relationships", () => {
    const uri = (value: string) => ({ type: "uri", value });
    const rows: Binding[] = [
      { s: uri(ns + "a"), type: uri(ns + "Policy") },
      { s: uri(ns + "a"), type: uri(ns + "PolicyClause") },
      { s: uri(ns + "b"), type: uri(ns + "Risk") },
      { s: uri(ns + "mention"), type: uri("https://other.org/Mention") },
    ];
    const relation = {
      s: uri(ns + "a"),
      p: uri(ns + "requires"),
      o: uri(ns + "b"),
    };
    const g = instanceGraph(ontology, rows, [
      relation,
      relation,
      { ...relation, p: uri(ns + "unknown") },
      { ...relation, o: uri(ns + "missing") },
    ]);
    expect(g.nodes).toHaveLength(2);
    expect(g.nodes[0].type).toBe("PolicyClause");
    expect(g.edges).toHaveLength(1);
  });
  it("finds relation endpoints, respects isolation and never draws dangling edges when capped", () => {
    const g = ontologyGraph(ontology);
    const options = {
      search: "防范风险",
      type: "",
      isolated: true,
      focus: null,
      limit: 220,
    };
    expect(visibleGraph(g, options).nodes).toHaveLength(2);
    const capped = visibleGraph(g, { ...options, search: "", limit: 1 });
    expect(capped.truncated).toBe(true);
    expect(capped.edges).toHaveLength(0);
    const disconnected = { ...g, edges: g.edges.filter((e) => !e.inherited) };
    expect(
      visibleGraph(disconnected, { ...options, search: "", isolated: false })
        .nodes,
    ).toHaveLength(2);
    expect(
      visibleGraph(g, { ...options, search: "", focus: ns + "Risk" }).nodes,
    ).toHaveLength(2);
  });
  it("rejects SPARQL injection and non-http identifiers", () => {
    expect(safeGraphIri(ns + "a")).toBe(`<${ns}a>`);
    for (const iri of [
      "javascript:alert(1)",
      ns + "a> . ?s ?p ?o",
      ns + 'a"',
      ns + "a\\b",
      "not-an-iri",
    ])
      expect(() => safeGraphIri(iri)).toThrow("GRAPH_INVALID_INPUT");
  });
  it("flags conflicting clause mappings without treating repeated equal values as a conflict", () => {
    const props = [
      { iri: ns + "clauseNumber", label: "条号", values: ["第一条", "第二条"] },
    ];
    expect(propertyConflict("PolicyClause", props)).toBe(true);
    expect(propertyConflict("Risk", props)).toBe(false);
    expect(
      propertyConflict("PolicyClause", [
        { ...props[0], values: ["第一条", "第一条"] },
      ]),
    ).toBe(false);
  });
});
