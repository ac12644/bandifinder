/**
 * Base Agent Factory
 *
 * Creates specialized agents backed by OpenRouter.
 *
 * Agents are memoized by name: every caller wants the same instance, and
 * building one is a network-configured object, not a per-request value. This
 * used to be a hand-rolled promise singleton repeated in all five agent
 * modules.
 */

import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { StructuredTool } from "@langchain/core/tools";

interface AgentConfig {
  name: string;
  /** Sampling temperature. Higher for open-ended analysis, lower for lookup. */
  temperature: number;
  tools: StructuredTool[];
  prompt: string;
}

const MODEL = "google/gemini-2.5-flash-lite";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const cache = new Map<string, Promise<ReturnType<typeof createReactAgent>>>();

/**
 * Create (or return the already-built) specialized agent.
 */
export function createSpecializedAgent(config: AgentConfig) {
  const cached = cache.get(config.name);
  if (cached) return cached;

  const { name, temperature, tools, prompt } = config;

  const llm = new ChatOpenAI({
    model: MODEL,
    temperature,
    apiKey: process.env.OPENROUTER_API_KEY,
    maxRetries: 2,
    timeout: 60000,
    configuration: {
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": "https://bandifinder.it",
        "X-Title": "Bandifinder.it",
      },
    },
  });

  const agent = Promise.resolve(
    createReactAgent({ llm, tools, messageModifier: prompt })
  );

  console.log(`[${name}] Agent created (OpenRouter: ${MODEL}, temp ${temperature})`);

  cache.set(name, agent);
  return agent;
}
