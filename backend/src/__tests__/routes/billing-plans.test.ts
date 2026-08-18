import { describe, it, expect } from "vitest";
import { PLANS, getPlanConfig, getPlanLimits } from "../../lib/stripe";

describe("Billing Plan Configuration", () => {
  it("has 4 plan tiers defined", () => {
    expect(Object.keys(PLANS)).toHaveLength(4);
    expect(PLANS.free).toBeDefined();
    expect(PLANS.starter).toBeDefined();
    expect(PLANS.pro).toBeDefined();
    expect(PLANS.enterprise).toBeDefined();
  });

  it("free plan has correct limits", () => {
    const free = PLANS.free;
    expect(free.price).toBe(0);
    expect(free.limits.searchesPerDay).toBe(5);
    expect(free.limits.users).toBe(1);
    expect(free.limits.bidsActive).toBe(3);
    expect(free.limits.exportEnabled).toBe(false);
    expect(free.limits.pipelineEnabled).toBe(false);
  });

  it("starter plan has correct limits", () => {
    const starter = PLANS.starter;
    expect(starter.price).toBe(99);
    expect(starter.limits.searchesPerDay).toBe(50);
    expect(starter.limits.users).toBe(3);
    expect(starter.limits.bidsActive).toBe(20);
    expect(starter.limits.exportEnabled).toBe(true);
    expect(starter.limits.pipelineEnabled).toBe(true);
  });

  it("pro plan has unlimited searches and bids", () => {
    const pro = PLANS.pro;
    expect(pro.price).toBe(249);
    expect(pro.limits.searchesPerDay).toBe(-1); // unlimited
    expect(pro.limits.users).toBe(10);
    expect(pro.limits.bidsActive).toBe(-1); // unlimited
    expect(pro.limits.apiAccess).toBe(true);
  });

  it("enterprise plan has all unlimited", () => {
    const enterprise = PLANS.enterprise;
    expect(enterprise.limits.searchesPerDay).toBe(-1);
    expect(enterprise.limits.users).toBe(-1);
    expect(enterprise.limits.bidsActive).toBe(-1);
    expect(enterprise.limits.apiAccess).toBe(true);
  });

  it("getPlanConfig falls back to free for unknown plan", () => {
    const config = getPlanConfig("nonexistent");
    expect(config.id).toBe("free");
    expect(config.price).toBe(0);
  });

  it("getPlanLimits returns correct limits for each plan", () => {
    expect(getPlanLimits("free").searchesPerDay).toBe(5);
    expect(getPlanLimits("starter").searchesPerDay).toBe(50);
    expect(getPlanLimits("pro").searchesPerDay).toBe(-1);
  });

  it("plan tiers have increasing capabilities", () => {
    const free = PLANS.free.limits;
    const starter = PLANS.starter.limits;
    const pro = PLANS.pro.limits;

    // Searches increase
    expect(starter.searchesPerDay).toBeGreaterThan(free.searchesPerDay);

    // Users increase
    expect(starter.users).toBeGreaterThan(free.users);
    expect(pro.users).toBeGreaterThan(starter.users);

    // Free has no export/pipeline, others do
    expect(free.exportEnabled).toBe(false);
    expect(starter.exportEnabled).toBe(true);
    expect(pro.exportEnabled).toBe(true);
  });
});
