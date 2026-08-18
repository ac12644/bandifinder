/**
 * Reflection and the quality gate
 *
 * Reflection is an LLM grading another LLM's output. It costs an extra call
 * per turn plus up to `maxReflectionRetries` re-runs of the agent behind it.
 *
 * Two things were wrong. It ran on "analyze" and "rank", whose numbers now
 * come from the deterministic scoring engine — there is nothing there for a
 * judge to verify, and a fluent wrong answer grades well. And when the judge
 * errored or returned unparseable JSON, the node returned a fabricated 0.75,
 * which sits above minScoreThreshold, so a failed assessment was recorded as
 * a pass.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const { QUALITY_CONFIG, interpretReflection, unassessedReflection } = await import(
  "../../agents/supervisor"
);
const source = readFileSync("src/agents/supervisor.ts", "utf8");

describe("reflection triggers", () => {
  it("runs only for contract review", () => {
    expect(QUALITY_CONFIG.reflectionTriggerIntents).toEqual(["review_contract"]);
  });

  it.each(["analyze", "rank", "search", "personalize"])(
    "does not spend an LLM judge call on %s",
    (intent) => {
      expect(QUALITY_CONFIG.reflectionTriggerIntents).not.toContain(intent);
    }
  );

  it("still bounds the retry loop", () => {
    // Each retry re-runs the agent and the judge, so this multiplies cost.
    expect(QUALITY_CONFIG.maxReflectionRetries).toBeLessThanOrEqual(2);
  });
});

describe("unassessed quality is not a passing grade", () => {
  const PASS = QUALITY_CONFIG.minScoreThreshold;

  it("reads a well-formed verdict", () => {
    const r = interpretReflection(
      JSON.stringify({
        overallScore: 90,
        issues: ["minor"],
        suggestion: "tighten the summary",
      }),
      0
    );

    expect(r.qualityAssessed).toBe(true);
    expect(r.qualityScore).toBeCloseTo(0.9);
    expect(r.qualityIssues).toEqual(["minor"]);
    expect(r.reflectionFeedback).toBe("tighten the summary");
    expect(r.needsReflection).toBe(false);
  });

  it("asks for another pass on a genuinely low score", () => {
    const r = interpretReflection(JSON.stringify({ overallScore: 20 }), 0);

    expect(r.qualityAssessed).toBe(true);
    expect(r.qualityScore).toBeLessThan(PASS);
    expect(r.needsReflection).toBe(true);
  });

  it.each([
    ["no JSON at all", "the response looks fine to me"],
    ["malformed JSON", "{ overallScore: 90, "],
    ["a missing score", JSON.stringify({ issues: ["x"] })],
    ["a non-numeric score", JSON.stringify({ overallScore: "excellent" })],
  ])("does not fabricate a passing grade from %s", (_label, raw) => {
    const r = interpretReflection(raw, 0);

    // The old fallback returned 0.75, above the 0.7 pass threshold, so a judge
    // that failed was recorded as having approved the answer.
    expect(r.qualityAssessed).toBe(false);
    expect(r.qualityScore).toBeLessThan(PASS);
    expect(r.qualityScore).not.toBe(0.75);
  });

  it("clamps an out-of-range score instead of trusting it", () => {
    expect(interpretReflection(JSON.stringify({ overallScore: 900 }), 0).qualityScore).toBe(1);
    expect(interpretReflection(JSON.stringify({ overallScore: -50 }), 0).qualityScore).toBe(0);
  });

  it("always advances the retry counter so the loop terminates", () => {
    expect(interpretReflection("garbage", 0).reflectionCount).toBe(1);
    expect(interpretReflection(JSON.stringify({ overallScore: 10 }), 1).reflectionCount).toBe(2);
  });

  it("stops asking for retries at the cap", () => {
    const atCap = QUALITY_CONFIG.maxReflectionRetries - 1;
    const r = interpretReflection(JSON.stringify({ overallScore: 10 }), atCap);

    expect(r.needsReflection).toBe(false);
  });

  it("marks an unreachable judge as unassessed", () => {
    const r = unassessedReflection(0);

    expect(r.qualityAssessed).toBe(false);
    expect(r.needsReflection).toBe(false);
  });

  it("gates on qualityAssessed before treating a score as a verdict", () => {
    // Without this guard an unassessed response (score 0) reads as a failing
    // grade and routes every unjudged high-stakes turn to human review.
    expect(source).toMatch(/const lowQuality\s*=\s*\n?\s*qualityAssessed &&/);
  });
});

describe("human review was removed", () => {
  // Resuming an interrupted graph needs `new Command({ resume })` on the same
  // thread, a durable checkpointer, and an endpoint to deliver it. None
  // existed, so a triggered interrupt stalled the SSE stream permanently.
  it("no longer calls interrupt()", () => {
    expect(source).not.toMatch(/\binterrupt\s*\(/);
  });

  it("no longer imports interrupt from langgraph", () => {
    expect(source).not.toMatch(/^\s*interrupt,\s*$/m);
  });

  it("has no human_review node in the graph", () => {
    expect(source).not.toMatch(/addNode\("human_review"/);
    expect(source).not.toMatch(/addEdge\("human_review"/);
  });

  it("routes the quality gate straight to formatting", () => {
    expect(source).toMatch(/addEdge\("quality_gate", "format"\)/);
  });

  it("has no code path that returns the removed node name", () => {
    // Checking only the edge map missed a router still returning
    // "human_review", which would throw the moment a high-stakes response
    // scored low.
    expect(source).not.toMatch(/return\s+"human_review"/);
  });
});

describe("high-stakes handling is unchanged", () => {
  it("still treats contract review and analysis as high stakes", () => {
    expect(QUALITY_CONFIG.highStakesIntents).toContain("review_contract");
    expect(QUALITY_CONFIG.highStakesIntents).toContain("analyze");
  });

  it("keeps the contract risk-pattern check independent of the judge", () => {
    // Risk clauses must escalate regardless of whether reflection ran.
    expect(source).toMatch(/responsabilit(à|a) illimitata|unlimited liability/);
  });
});
