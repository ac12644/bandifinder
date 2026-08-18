/**
 * GraphRAG request isolation
 *
 * The retriever used to hold a process-wide KnowledgeGraph singleton. Each
 * retrieval added its vector hits to that shared graph and then traversed it,
 * so a query's graph expansion walked whatever every previous caller on the
 * same serverless instance had searched for — and the graph grew for the
 * lifetime of the instance.
 *
 * These tests pin the two properties that fixes: a retrieval sees only its own
 * data, and the graph does not accumulate.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const search = vi.fn();
vi.mock("../../lib/pinecone", () => ({
  pineconeService: {
    search: (...a: unknown[]) => search(...a),
    getStats: vi.fn(),
    upsertTenders: vi.fn(),
  },
}));

const { createGraphRAGRetriever, KnowledgeGraph } = await import(
  "../../lib/graphrag"
);

/** Build a Pinecone-shaped hit. Shared CPV is what links tenders in the graph. */
function hit(id: string, cpv = "72000000", buyer = "Comune di Roma") {
  return {
    id,
    score: 0.9,
    tender: {
      title: `Tender ${id}`,
      description: `Description for ${id}`,
      cpvCodes: [cpv],
      contractingAuthority: buyer,
      country: "ITA",
      value: 100_000,
      currency: "EUR",
      deadline: "2026-12-01",
    },
  };
}

const query = (q: string) => ({ query: q, options: { includeExplanation: false } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("retrieval isolation", () => {
  // Expansion crosses SIMILAR_TO edges, which are built between results of the
  // same batch. So one query's tenders reach another's when the two batches
  // share a tender: the shared node carries the earlier batch's edges into the
  // later traversal. That is the concrete cross-request leak.
  it("does not reach a previous query's tenders through a shared tender", async () => {
    // Query A: two tenders with identical CPV -> SIMILAR_TO edge between them.
    search.mockResolvedValueOnce([hit("shared"), hit("org-a-only")]);
    const resA = await createGraphRAGRetriever().retrieve(query("servizi"));
    expect(resA.results.map((r) => r.tenderId).sort()).toEqual([
      "org-a-only",
      "shared",
    ]);

    // Query B re-hits "shared". With a process-wide graph, traversing from it
    // follows query A's SIMILAR_TO edge and pulls org-a-only into B's results.
    search.mockResolvedValueOnce([hit("shared"), hit("org-b-only")]);
    const resB = await createGraphRAGRetriever().retrieve(query("servizi"));

    const ids = resB.results.map((r) => r.tenderId);
    expect(ids).toContain("org-b-only");
    expect(ids).toContain("shared");
    expect(ids).not.toContain("org-a-only");
  });

  it("returns the same results for the same query regardless of history", async () => {
    search.mockResolvedValueOnce([hit("t1"), hit("t2")]);
    const first = await createGraphRAGRetriever().retrieve(query("cloud"));

    // Unrelated traffic in between, overlapping on t1.
    search.mockResolvedValueOnce([hit("t1"), hit("noise")]);
    await createGraphRAGRetriever().retrieve(query("altro"));

    search.mockResolvedValueOnce([hit("t1"), hit("t2")]);
    const second = await createGraphRAGRetriever().retrieve(query("cloud"));

    expect(second.results.map((r) => r.tenderId).sort()).toEqual(
      first.results.map((r) => r.tenderId).sort()
    );
  });

  it("stays correct when one instance is reused for several retrievals", async () => {
    const retriever = createGraphRAGRetriever();

    search.mockResolvedValueOnce([hit("shared"), hit("first-only")]);
    await retriever.retrieve(query("uno"));

    search.mockResolvedValueOnce([hit("shared"), hit("second-only")]);
    const second = await retriever.retrieve(query("due"));

    const ids = second.results.map((r) => r.tenderId);
    expect(ids).toContain("second-only");
    expect(ids).not.toContain("first-only");
  });
});

describe("graph does not accumulate", () => {
  it("holds a constant node count across repeated retrievals", async () => {
    const retriever = createGraphRAGRetriever();

    search.mockResolvedValueOnce([hit("a")]);
    await retriever.retrieve(query("uno"));
    const afterFirst = retriever.getStats().nodeCount;

    for (const id of ["b", "c", "d", "e"]) {
      search.mockResolvedValueOnce([hit(id)]);
      await retriever.retrieve(query(id));
    }
    const afterMany = retriever.getStats().nodeCount;

    expect(afterFirst).toBeGreaterThan(0);
    expect(afterMany).toBe(afterFirst);
  });

  it("grows with the size of one query, not with the number of queries", async () => {
    const retriever = createGraphRAGRetriever();

    search.mockResolvedValueOnce([hit("only")]);
    await retriever.retrieve(query("piccola"));
    const small = retriever.getStats().nodeCount;

    search.mockResolvedValueOnce(
      ["x", "y", "z"].map((id, i) => hit(id, `4500000${i}`, `Buyer ${id}`))
    );
    await retriever.retrieve(query("grande"));
    const large = retriever.getStats().nodeCount;

    expect(large).toBeGreaterThan(small);
  });
});

describe("construction", () => {
  it("hands out a distinct instance each call", () => {
    expect(createGraphRAGRetriever()).not.toBe(createGraphRAGRetriever());
  });

  it("exposes no process-wide graph accessor", async () => {
    const mod = await import("../../lib/graphrag");
    expect("getKnowledgeGraph" in mod).toBe(false);
    expect("resetKnowledgeGraph" in mod).toBe(false);
    expect("getGraphRAGRetriever" in mod).toBe(false);
  });

  it("still exports KnowledgeGraph for deliberate construction", () => {
    expect(new KnowledgeGraph().getStats().nodeCount).toBe(0);
  });
});
