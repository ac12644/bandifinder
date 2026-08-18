/**
 * Base Agent Factory
 *
 * Creates specialized agents with configurable LLM tiers and tools.
 * Uses OpenRouter with free Gemma 3 27B model.
 */

import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { StructuredTool } from "@langchain/core/tools";

export type ModelTier = "small" | "medium" | "large";

interface AgentConfig {
  name: string;
  modelTier: ModelTier;
  tools: StructuredTool[];
  prompt: string;
}

// Model mapping for each tier - using OpenRouter models
const MODEL_CONFIG: Record<ModelTier, { model: string; temperature: number }> =
  {
    small: { model: "google/gemini-2.5-flash-lite", temperature: 0.1 },
    medium: { model: "google/gemini-2.5-flash-lite", temperature: 0.2 },
    large: { model: "google/gemini-2.5-flash-lite", temperature: 0.3 },
  };

// OpenRouter configuration
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Create a specialized agent with the given configuration.
 */
export async function createSpecializedAgent(config: AgentConfig) {
  const { name, modelTier, tools, prompt } = config;
  const modelConfig = MODEL_CONFIG[modelTier];

  // Create LLM instance using OpenRouter
  const llm = new ChatOpenAI({
    model: modelConfig.model,
    temperature: modelConfig.temperature,
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

  // Create React agent with tools
  const agent = createReactAgent({
    llm,
    tools,
    messageModifier: prompt,
  });

  console.log(
    `[${name}] Agent created with ${modelTier} model (OpenRouter: ${modelConfig.model})`
  );

  return agent;
}
