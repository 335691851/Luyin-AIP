import { describe, expect, it } from "vitest";
import { graphPositions } from "../src/lib/graph-layout";
import type { GraphNode, GraphEdge } from "../src/lib/knowledge-graph";

describe("stable graph layout", () => {
  it("handles empty, isolated and missing endpoints without mutating source data", () => {
    expect(graphPositions([], [])).toEqual([]);
    const nodes: GraphNode[] = [
      { id: "a", label: "A", type: "company", typeLabel: "公司" },
    ];
    const edges: GraphEdge[] = [
      {
        id: "e",
        source: "a",
        target: "missing",
        label: "关联",
        predicate: "p",
        description: "",
      },
    ];
    const source = JSON.stringify({ nodes, edges });
    const result = graphPositions(nodes, edges);
    expect(result).toHaveLength(1);
    expect(Number.isFinite(result[0].x) && Number.isFinite(result[0].y)).toBe(
      true,
    );
    expect(JSON.stringify({ nodes, edges })).toBe(source);
  });

  it("gives a dense graph repeatable finite positions, without random re-layout", () => {
    const nodes: GraphNode[] = Array.from({ length: 220 }, (_, i) => ({
      id: String(i),
      label: String(i),
      type: "clause",
      typeLabel: "条款",
    }));
    const edges: GraphEdge[] = nodes
      .slice(1)
      .map((n, i) => ({
        id: `e${i}`,
        source: String(i % 15),
        target: n.id,
        label: "关联",
        predicate: "p",
        description: "",
      }));
    const first = graphPositions(nodes, edges);
    expect(first).toEqual(graphPositions(nodes, edges));
    expect(
      first.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    ).toBe(true);
    expect(new Set(first.map((p) => `${p.x},${p.y}`)).size).toBe(nodes.length);
  });
});
