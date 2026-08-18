/**
 * Contract Review Agent Tools
 *
 * Tools for analyzing contracts and identifying risks.
 * Uses OpenRouter for chat completions, OpenAI for embeddings.
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { OpenAI } from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

// Lazy-initialized clients
let openrouterClient: OpenAI | null = null;
let openaiEmbeddingsClient: OpenAI | null = null;
let pineconeClient: Pinecone | null = null;

function getOpenRouter(): OpenAI {
  if (!openrouterClient) {
    openrouterClient = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://bandifinder.it",
        "X-Title": "Bandifinder.it",
      },
    });
  }
  return openrouterClient;
}

function getOpenAIEmbeddings(): OpenAI {
  if (!openaiEmbeddingsClient) {
    openaiEmbeddingsClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiEmbeddingsClient;
}

function getPinecone(): Pinecone {
  if (!pineconeClient) {
    if (!process.env.PINECONE_API_KEY) {
      throw new Error("PINECONE_API_KEY environment variable is required");
    }
    pineconeClient = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  }
  return pineconeClient;
}

// Model for chat completions via OpenRouter
const CHAT_MODEL = "google/gemini-2.5-flash-lite";

/**
 * Analyze a contract document for key terms and risks.
 */
export const analyzeContractTool = tool(
  async ({ contractText, contractType }) => {
    try {
      // Use OpenRouter to analyze the contract
      const response = await getOpenRouter().chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a contract analysis expert specializing in ${
              contractType || "public procurement"
            } contracts.
Analyze the contract and provide a structured analysis in JSON format with:
- summary: Brief overview (2-3 sentences)
- keyTerms: Object with duration, value, paymentTerms, penalties, terminationClauses
- obligations: Array of key obligations for each party
- risks: Array of potential risks with severity (low/medium/high/critical)
- recommendations: Array of negotiation points or areas needing attention
- overallRiskScore: Number 0-100

Respond only with valid JSON.`,
          },
          {
            role: "user",
            content: contractText,
          },
        ],
        max_tokens: 2000,
      });

      // Parse JSON from response (Gemma returns JSON when prompted correctly)
      const content = response.choices[0].message.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const analysis = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");

      return JSON.stringify({
        success: true,
        analysis,
        contractType,
        analyzedAt: new Date().toISOString(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error:
          error instanceof Error ? error.message : "Contract analysis failed",
      });
    }
  },
  {
    name: "analyze_contract",
    description:
      "Analyze a contract document for key terms, obligations, and risks.",
    schema: z.object({
      contractText: z.string().describe("The contract text to analyze"),
      contractType: z
        .string()
        .optional()
        .describe(
          "Type of contract (e.g., 'public procurement', 'service agreement')"
        ),
    }),
  }
);

/**
 * Extract specific clauses from a contract.
 */
export const extractClausesTool = tool(
  async ({ contractText, clauseTypes }) => {
    try {
      const response = await getOpenRouter().chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          {
            role: "system",
            content: `Extract the following clause types from the contract: ${clauseTypes.join(
              ", "
            )}.
For each clause type, provide:
- found: boolean
- text: The actual clause text if found
- location: Where in the document it appears
- notes: Any important observations

Respond in JSON format with clauseTypes as keys.`,
          },
          {
            role: "user",
            content: contractText,
          },
        ],
        max_tokens: 1500,
      });

      const content = response.choices[0].message.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const clauses = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");

      return JSON.stringify({
        success: true,
        clauses,
        requestedTypes: clauseTypes,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error:
          error instanceof Error ? error.message : "Clause extraction failed",
      });
    }
  },
  {
    name: "extract_clauses",
    description: "Extract specific types of clauses from a contract document.",
    schema: z.object({
      contractText: z.string().describe("The contract text"),
      clauseTypes: z
        .array(z.string())
        .describe(
          "Types of clauses to extract (e.g., 'payment', 'liability', 'termination')"
        ),
    }),
  }
);

/**
 * Identify risks in a contract using RAG.
 */
export const identifyRisksTool = tool(
  async ({ contractText, industry }) => {
    try {
      // Generate embedding for the contract (using OpenAI embeddings)
      const embeddingResponse = await getOpenAIEmbeddings().embeddings.create({
        model: "text-embedding-3-small",
        input: `Contract risk analysis for ${
          industry || "general"
        } industry: ${contractText.substring(0, 4000)}`,
        dimensions: 512,
      });

      const queryVector = embeddingResponse.data[0].embedding;

      // Search for similar risky contract patterns in Pinecone
      // (This would require a pre-populated index of contract risk patterns)
      const index = getPinecone().index("tender");

      let similarRisks: unknown[] = [];
      try {
        const searchResult = await index.namespace("contract-risks").query({
          vector: queryVector,
          topK: 5,
          includeMetadata: true,
        });
        similarRisks = searchResult.matches.map((m) => m.metadata);
      } catch {
        // Namespace might not exist yet, continue with AI analysis
      }

      // Use OpenRouter to identify risks
      const response = await getOpenRouter().chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a contract risk assessment expert for ${
              industry || "general"
            } industry contracts.
Identify all potential risks in the contract. For each risk, provide:
- category: The risk category (legal, financial, operational, compliance, reputational)
- description: What the risk is
- severity: low/medium/high/critical
- likelihood: low/medium/high
- impact: What could happen if this risk materializes
- mitigation: How to address or mitigate this risk
- clauseReference: Which part of the contract contains this risk

Also provide an overallRiskScore (0-100) and topConcerns (array of top 3 issues).
Respond in JSON format.`,
          },
          {
            role: "user",
            content: contractText,
          },
        ],
        max_tokens: 2000,
      });

      const content = response.choices[0].message.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const riskAnalysis = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");

      return JSON.stringify({
        success: true,
        ...riskAnalysis,
        similarPastRisks: similarRisks,
        industry,
        analyzedAt: new Date().toISOString(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error:
          error instanceof Error ? error.message : "Risk identification failed",
      });
    }
  },
  {
    name: "identify_risks",
    description:
      "Identify potential risks in a contract using AI and historical patterns.",
    schema: z.object({
      contractText: z.string().describe("The contract text to analyze"),
      industry: z
        .string()
        .optional()
        .describe("Industry context for risk assessment"),
    }),
  }
);
