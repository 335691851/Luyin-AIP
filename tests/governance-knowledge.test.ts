import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../src/server/knowledge-graph", () => ({
  getKnowledgeGraph: vi.fn(),
  getKnowledgeDetail: vi.fn(),
}));

import {
  getKnowledgeGraph,
  getKnowledgeDetail,
} from "../src/server/knowledge-graph";
import { governanceKnowledge } from "../src/server/governance-knowledge";

const ids = Array.from(
  { length: 11 },
  (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
);

describe("governance associated-document retrieval", () => {
  it("deduplicates concurrent lookups within the same document scope", async () => {
    await Promise.all([
      governanceKnowledge([ids[0]], "缓存专用问题"),
      governanceKnowledge([ids[0]], "缓存专用问题"),
    ]);
    expect(getKnowledgeGraph).toHaveBeenCalledTimes(1);
    expect(getKnowledgeDetail).toHaveBeenCalledTimes(1);
  });

  it("retains available evidence when one referenced document fails", async () => {
    vi.mocked(getKnowledgeGraph).mockRejectedValueOnce(
      Error("temporarily unavailable"),
    );
    const result = await governanceKnowledge([ids[1], ids[2]], "局部失败问题");
    expect(result).toHaveLength(1);
    expect(result[0].label).toContain(ids[2]);
  });
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getKnowledgeGraph).mockImplementation(
      async (_mode, documentId) => ({
        documentId,
        view: "instances",
        ontologyId: "test",
        documents: [],
        types: [],
        summary: {
          documents: 1,
          entities: 1,
          triples: 0,
          classes: 1,
          objectProperties: 0,
        },
        loadedAt: "2026-11-06",
        nodes: [
          {
            id: `${documentId}/entity`,
            label: documentId === ids[9] ? "董事授权" : "制度",
            type: "Policy",
            typeLabel: "制度",
          },
        ],
        edges: [],
      }),
    );
    vi.mocked(getKnowledgeDetail).mockImplementation(async (_doc, iri) => ({
      node: { id: iri, label: iri, type: "Policy", typeLabel: "制度" },
      properties: [],
      evidence: [],
      propertiesTruncated: false,
      evidenceTruncated: false,
      conflict: false,
      loadedAt: "2026-11-06",
    }));
  });

  it("searches ten unique valid associated documents and retains relevant evidence from the tenth", async () => {
    const results = await governanceKnowledge(
      ["invalid", ids[0], ...ids],
      "董事授权",
    );
    expect(getKnowledgeGraph).toHaveBeenCalledTimes(10);
    expect(
      vi.mocked(getKnowledgeGraph).mock.calls.map((call) => call[1]),
    ).toEqual(ids.slice(0, 10));
    expect(getKnowledgeDetail).toHaveBeenCalledTimes(10);
    expect(results[0].label).toBe(`${ids[9]}/entity`);
    expect(getKnowledgeGraph).not.toHaveBeenCalledWith("instances", ids[10]);
  });

  it("does not search any documents outside the supplied company references", async () => {
    await governanceKnowledge([ids[7]], "授权");
    expect(getKnowledgeGraph).toHaveBeenCalledExactlyOnceWith(
      "instances",
      ids[7],
    );
    expect(getKnowledgeDetail).toHaveBeenCalledExactlyOnceWith(
      ids[7],
      `${ids[7]}/entity`,
    );
  });

  it("does not call the graph when no valid associated documents exist", async () => {
    expect(await governanceKnowledge(["invalid"], "授权")).toEqual([]);
    expect(getKnowledgeGraph).not.toHaveBeenCalled();
    expect(getKnowledgeDetail).not.toHaveBeenCalled();
  });
});
