/**
 * Agent node timeouts
 *
 * The timeout used to be a Promise.race against a setTimeout. Losing that race
 * rejected the node but left the agent running: the LLM request stayed open
 * and kept billing tokens, and the timer was never cleared, so it fired later
 * against nothing and held a handle open in the meantime.
 *
 * The timeout now aborts the run through an AbortSignal and clears its timer
 * in a finally block.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createAgentNode } from "../../agents/supervisor";

const state = { messages: [] } as never;

/** An agent that resolves after `ms`, recording the config it was handed. */
function agentTaking(ms: number) {
  const seen: { config?: { signal?: AbortSignal } } = {};

  const agent = {
    invoke: (_input: unknown, config: { signal?: AbortSignal }) => {
      seen.config = config;
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve({ messages: [] }), ms);
        // A real client rejects when its signal aborts; mirror that.
        config?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new Error("aborted"));
        });
      });
    },
  };

  return { agent, seen };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("cancellation", () => {
  it("hands the agent an abort signal", async () => {
    const { agent, seen } = agentTaking(0);
    const node = createAgentNode("test_agent", async () => agent, 1000);

    await node(state, { configurable: { thread_id: "t1" } });

    expect(seen.config?.signal).toBeInstanceOf(AbortSignal);
  });

  it("preserves the caller's config alongside the signal", async () => {
    const { agent, seen } = agentTaking(0);
    const node = createAgentNode("test_agent", async () => agent, 1000);

    await node(state, { configurable: { thread_id: "t1", user_id: "u1" } });

    expect(
      (seen.config as { configurable?: { user_id?: string } }).configurable?.user_id
    ).toBe("u1");
  });

  it("aborts the run when the timeout expires", async () => {
    const { agent, seen } = agentTaking(10_000);
    const node = createAgentNode("slow_agent", async () => agent, 20);

    await expect(node(state, {})).rejects.toThrow(/timed out after 20ms/);

    // The point of the fix: the underlying call is cancelled, not orphaned.
    expect(seen.config?.signal?.aborted).toBe(true);
  });

  it("reports a timeout as a timeout, not as the client's abort error", async () => {
    const { agent } = agentTaking(10_000);
    const node = createAgentNode("slow_agent", async () => agent, 20);

    await expect(node(state, {})).rejects.toThrow(/slow_agent/);
  });
});

describe("timer hygiene", () => {
  it("clears the timer once the agent completes", async () => {
    vi.useFakeTimers();

    const seen: { signal?: AbortSignal } = {};
    const agent = {
      invoke: async (_i: unknown, config: { signal?: AbortSignal }) => {
        seen.signal = config?.signal;
        return { messages: [] };
      },
    };

    const node = createAgentNode("fast_agent", async () => agent, 1000);
    await node(state, {});

    // If the timer were still pending it would abort here, long after the run
    // finished — the leak the finally block closes.
    await vi.advanceTimersByTimeAsync(5000);

    expect(seen.signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves no pending timer after a timeout either", async () => {
    vi.useFakeTimers();

    const { agent } = agentTaking(10_000);
    const node = createAgentNode("slow_agent", async () => agent, 20);

    const settled = node(state, {}).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(50);

    expect(await settled).toBeInstanceOf(Error);

    // The agent's own timer is cleared by its abort listener; the node's timer
    // is cleared in finally. Neither should outlive the call.
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("normal operation", () => {
  it("returns the agent's messages and records elapsed time", async () => {
    const agent = {
      invoke: async () => ({ messages: ["m1", "m2"] }),
    };
    const node = createAgentNode("ok_agent", async () => agent, 1000);

    const result = await node(state, {});

    expect(result.messages).toEqual(["m1", "m2"]);
    expect(typeof result.executionTimeMs).toBe("number");
  });

  it("propagates a genuine agent error unchanged", async () => {
    const agent = {
      invoke: async () => {
        throw new Error("TED API unavailable");
      },
    };
    const node = createAgentNode("failing_agent", async () => agent, 1000);

    await expect(node(state, {})).rejects.toThrow("TED API unavailable");
  });
});
