/**
 * Supervisor Agent - Enterprise-Grade Multi-Agent Orchestrator
 *
 * Advanced Features:
 * ✅ Intent Classification & Routing
 * ✅ Specialized Agent Delegation
 * ✅ Reflection Node (Self-Critique)
 * ✅ Quality Gate (Validation)
 * ✅ Human-in-the-Loop Hooks
 * ✅ Conversation Checkpointing
 */

import {
  START,
  END,
  StateGraph,
  Annotation,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import { BaseMessage, AIMessage, HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {
  searchAgent,
  analysisAgent,
  personalizationAgent,
  rankingAgent,
  contractReviewAgent,
} from "./specialists";
import { logger } from "../lib/observability";
import { getCheckpointer } from "../lib/checkpointer";

// ============================================================================
// EXTENDED STATE ANNOTATION
// ============================================================================

/** A last-write-wins channel with a starting value. */
const lastValue = <T>(initial: T) =>
  Annotation<T>({ reducer: (_, update) => update, default: () => initial });

/**
 * Extended workflow state with quality control fields.
 */
export const SupervisorState = Annotation.Root({
  // Core message history — the one channel that accumulates rather than replaces.
  messages: Annotation<BaseMessage[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),

  intent: lastValue("unknown"),

  // Quality control
  qualityScore: lastValue(0),
  qualityIssues: lastValue<string[]>([]),

  // Whether qualityScore reflects a real assessment. When the judge is not run
  // or its output cannot be parsed, the score is meaningless and downstream
  // gates must not read it as a verdict.
  qualityAssessed: lastValue(false),

  // Reflection
  needsReflection: lastValue(false),
  reflectionFeedback: lastValue(""),
  reflectionCount: lastValue(0),

  // Human-in-the-loop
  requiresHumanReview: lastValue(false),
  humanReviewReason: lastValue(""),

  // Metadata
  agentUsed: lastValue(""),
  executionTimeMs: lastValue(0),
});

type SupervisorStateType = typeof SupervisorState.State;

// ============================================================================
// INTENT CLASSIFICATION
// ============================================================================

export type UserIntent =
  | "search"
  | "analyze"
  | "personalize"
  | "rank"
  | "review_contract"
  | "general"
  | "unknown";

/**
 * Questions about the product rather than about tenders.
 *
 * Checked before the tender keywords below, which are broad enough to swallow
 * them: "servizi" and "software" both appear in the search list, so
 * "che servizi offrite?" used to be classified as a tender search and answered
 * with a list of public contracts.
 */
function isGeneralQuestion(content: string): boolean {
  const patterns = [
    /\bcosa (puoi|sai) fare\b/,
    /\bcome funziona\b/,
    /\bchi sei\b/,
    /\bche cos'?è\b/,
    /\bcosa (è|e) bandifinder\b/,
    /\bche servizi (offrite|offri)\b/,
    /\ba cosa serv/,
    /\bpuoi aiutarmi\b/,
    /\bhelp\b/,
    /\baiuto\b/,
    /^\s*(ciao|salve|buongiorno|buonasera|hello|hi)\b/,
    /\bgrazie\b/,
  ];
  return patterns.some((p) => p.test(content));
}

function classifyIntent(messages: BaseMessage[]): UserIntent {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || !lastMessage.content) return "unknown";

  const content = String(lastMessage.content).toLowerCase();

  // Product questions and greetings first: the tender keywords below are broad
  // enough to capture them otherwise.
  if (isGeneralQuestion(content)) {
    return "general";
  }

  // Analysis intent
  if (
    content.includes("analizza") ||
    content.includes("eligibilità") ||
    content.includes("compatibile") ||
    content.includes("adatto") ||
    content.includes("score") ||
    content.includes("punteggio")
  ) {
    return "analyze";
  }

  // Contract review intent (HIGH STAKES - may trigger human review)
  if (
    content.includes("contratto") ||
    content.includes("contract") ||
    content.includes("revisione") ||
    content.includes("review") ||
    content.includes("rischi") ||
    content.includes("clausole")
  ) {
    return "review_contract";
  }

  // Ranking intent
  if (
    (content.includes("classifica") &&
      !content.includes("cerca") &&
      !content.includes("trova")) ||
    (content.includes("migliori") &&
      (content.includes("per me") || content.includes("personalizzato"))) ||
    content.includes("shortlist") ||
    content.includes("priorità")
  ) {
    return "rank";
  }

  // Personalization intent
  if (
    content.includes("suggerimenti") ||
    content.includes("raccomandazioni") ||
    content.includes("per me") ||
    content.includes("personalizzato") ||
    content.includes("consigli")
  ) {
    return "personalize";
  }

  // Search intent (default for tender-related queries)
  if (
    content.includes("bando") ||
    content.includes("bandi") ||
    content.includes("tender") ||
    content.includes("appalto") ||
    content.includes("appalti") ||
    content.includes("gara") ||
    content.includes("gare") ||
    content.includes("trova") ||
    content.includes("cerca") ||
    content.includes("mostra") ||
    content.includes("software") ||
    content.includes("servizi")
  ) {
    return "search";
  }

  return "general";
}

// ============================================================================
// QUALITY CONFIGURATION
// ============================================================================

const QUALITY_CONFIG = {
  minScoreThreshold: 0.7,
  maxReflectionRetries: 2,
  highStakesIntents: ["review_contract", "analyze"],

  // Reflection is an LLM grading another LLM, so it costs an extra call per
  // turn and up to `maxReflectionRetries` re-runs of the agent behind it.
  //
  // It used to run on "analyze" and "rank" too. Both now get their numbers
  // from the deterministic scoring engine, so there is nothing for a judge to
  // verify: it can only assess whether the prose around a computed score reads
  // well, and a fluent wrong answer scores highly. Contract review is the one
  // intent whose output is genuinely unstructured model reasoning.
  reflectionTriggerIntents: ["review_contract"],
};

// ============================================================================
// LLM FOR REFLECTION & QUALITY
// ============================================================================

function createReflectionLLM() {
  return new ChatOpenAI({
    model: "google/gemini-2.5-flash-lite",
    temperature: 0.1,
    apiKey: process.env.OPENROUTER_API_KEY,
    maxRetries: 2,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://bandifinder.it",
        "X-Title": "Bandifinder.it - Reflection",
      },
    },
  });
}

// ============================================================================
// NODE: CLASSIFY INTENT
// ============================================================================

async function classifyNode(state: SupervisorStateType) {
  const intent = classifyIntent(state.messages);
  const needsReflection =
    QUALITY_CONFIG.reflectionTriggerIntents.includes(intent);

  console.log(
    `[Supervisor] Intent: ${intent}, NeedsReflection: ${needsReflection}`
  );

  return {
    intent,
    needsReflection,
    agentUsed: intent,
  };
}

// ============================================================================
// NODE: ROUTE BY INTENT
// ============================================================================

function routeByIntent(state: SupervisorStateType): string {
  const { intent } = state;

  const routeMap: Record<string, string> = {
    search: "search",
    analyze: "analyze",
    personalize: "personalize",
    rank: "rank",
    review_contract: "review_contract",
    general: "general",
    unknown: "general",
  };

  // classifyIntent can return "general" and "unknown"; neither used to appear
  // here, so both fell through to tender search and a user asking what the
  // product does received a list of public contracts.
  return routeMap[intent] || "general";
}

// ============================================================================
// AGENT NODES WITH TIMEOUT
// ============================================================================

const AGENT_TIMEOUTS: Record<string, number> = {
  search_agent: 60000,
  analysis_agent: 90000,
  personalization_agent: 60000,
  ranking_agent: 60000,
  contract_review_agent: 180000,
};

// Lazy agent instances
let searchAgentInstance: Awaited<ReturnType<typeof searchAgent>> | null = null;
let analysisAgentInstance: Awaited<ReturnType<typeof analysisAgent>> | null =
  null;
let personalizationAgentInstance: Awaited<
  ReturnType<typeof personalizationAgent>
> | null = null;
let rankingAgentInstance: Awaited<ReturnType<typeof rankingAgent>> | null =
  null;
let contractReviewAgentInstance: Awaited<
  ReturnType<typeof contractReviewAgent>
> | null = null;

/**
 * Wrap an agent as a graph node with a cancelling timeout.
 *
 * Exported so the timeout contract can be exercised directly.
 */
export function createAgentNode(
  name: string,
  getAgent: () => Promise<unknown>,
  timeout: number
) {
  return async (state: SupervisorStateType, config: unknown) => {
    const startTime = Date.now();

    // Cancel through the run itself rather than racing a timer.
    //
    // This previously used Promise.race against a setTimeout. Losing that race
    // rejected the node but left the agent running: the LLM request stayed
    // open and kept billing tokens, and the timer was never cleared so it
    // fired later against nothing. Passing a signal aborts the underlying HTTP
    // call, and clearing the timer on completion releases the handle.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const agent = await getAgent();
      const result = await (agent as { invoke: Function }).invoke(
        { messages: state.messages },
        {
          ...(config as Record<string, unknown>),
          signal: controller.signal,
        }
      );

      const duration = Date.now() - startTime;
      console.log(`[${name}] Completed in ${duration}ms`);

      return {
        messages: (result as { messages: BaseMessage[] }).messages || [],
        executionTimeMs: duration,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        const timeoutError = new Error(
          `Agent ${name} timed out after ${timeout}ms`
        );
        logger.error(`[${name}] Timed out`, timeoutError, {
          timeoutMs: timeout,
          elapsedMs: Date.now() - startTime,
        });
        throw timeoutError;
      }

      logger.error(`[${name}] Failed`, error as Error, {
        elapsedMs: Date.now() - startTime,
      });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

// ============================================================================
// NODE: GENERAL
// ============================================================================

/**
 * Answer a question about the product rather than about tenders.
 *
 * "general" and "unknown" are declared intents that previously had no route,
 * so both fell through to the tender search agent. Handling them here keeps
 * the classifier's output meaningful and avoids spending a full search agent
 * run — with its TED and vector calls — on "ciao".
 */
async function generalNode(state: SupervisorStateType) {
  const lastMessage = state.messages[state.messages.length - 1];
  const question = String(lastMessage?.content || "");

  const llm = createReflectionLLM();

  const prompt = `Sei l'assistente di Bandifinder.it, una piattaforma che aiuta le imprese italiane a trovare e gestire bandi di gara pubblici (TED europeo e ANAC italiano).

COSA SAI FARE:
- Cercare bandi per settore, area geografica, importo e scadenza
- Calcolare un punteggio di compatibilità 0-100 fra un bando e il profilo aziendale, con raccomandazione BID / REVIEW / SKIP
- Spiegare i requisiti di ammissibilità di un bando
- Ordinare e creare shortlist di bandi
- Analizzare i rischi contrattuali

REGOLE:
- Rispondi in italiano, in modo breve e concreto (massimo 4 frasi)
- Non inventare bandi, punteggi o statistiche
- Se l'utente vuole cercare bandi, invitalo a descrivere settore e area geografica

DOMANDA DELL'UTENTE:
${question}`;

  try {
    const reply = await llm.invoke([new HumanMessage(prompt)]);
    return {
      messages: [new AIMessage(String(reply.content))],
      agentUsed: "general",
    };
  } catch (error) {
    logger.error("[General] Reply failed", error as Error);
    return {
      messages: [
        new AIMessage(
          "Sono l'assistente di Bandifinder.it: trovo bandi di gara pubblici e ne valuto la compatibilità con la tua azienda. Dimmi che settore ti interessa e in quale area."
        ),
      ],
      agentUsed: "general",
    };
  }
}

// ============================================================================
// NODE: REFLECTION (Self-Critique)
// ============================================================================

async function reflectionNode(state: SupervisorStateType) {
  const lastMessage = state.messages[state.messages.length - 1];
  const responseContent = String(lastMessage?.content || "");

  if (
    !responseContent ||
    state.reflectionCount >= QUALITY_CONFIG.maxReflectionRetries
  ) {
    return { needsReflection: false };
  }

  console.log(
    `[Reflection] Analyzing response quality (attempt ${
      state.reflectionCount + 1
    })`
  );

  const llm = createReflectionLLM();

  const reflectionPrompt = `You are a quality assurance agent. Analyze this AI response for a tender search platform.

RESPONSE TO ANALYZE:
${responseContent}

USER'S ORIGINAL QUESTION:
${state.messages.find((m) => m._getType() === "human")?.content || "Unknown"}

EVALUATION CRITERIA:
1. ACCURACY: Does the response contain factual information? (0-100)
2. COMPLETENESS: Does it fully answer the user's question? (0-100)
3. ACTIONABILITY: Does it provide clear next steps? (0-100)
4. SAFETY: No harmful recommendations or false promises? (0-100)

OUTPUT FORMAT (JSON only):
{
  "overallScore": <0-100>,
  "issues": ["issue1", "issue2"],
  "suggestion": "How to improve the response",
  "passesQualityGate": true/false
}`;

  try {
    const reflection = await llm.invoke([new HumanMessage(reflectionPrompt)]);
    return interpretReflection(String(reflection.content), state.reflectionCount);
  } catch (error) {
    logger.error("[Reflection] Judge call failed", error as Error, {
      intent: state.intent,
    });
    return unassessedReflection(state.reflectionCount);
  }
}

/**
 * Quality verdict when nothing could actually be measured.
 *
 * This previously returned a fabricated 0.75 — above minScoreThreshold — so a
 * judge that errored or emitted malformed JSON was silently recorded as having
 * passed. Reporting the assessment as absent instead lets the quality gate
 * skip its check rather than act on a number nobody produced.
 */
export interface ReflectionVerdict {
  qualityScore: number;
  qualityAssessed: boolean;
  qualityIssues: string[];
  reflectionFeedback: string;
  needsReflection: boolean;
  reflectionCount: number;
}

export function unassessedReflection(reflectionCount: number): ReflectionVerdict {
  return {
    qualityScore: 0,
    qualityAssessed: false,
    qualityIssues: [],
    reflectionFeedback: "",
    needsReflection: false,
    reflectionCount: reflectionCount + 1,
  };
}

/**
 * Turn the judge's raw reply into a state delta.
 *
 * Pure and exported so the failure modes — malformed JSON, missing fields,
 * out-of-range scores — can be exercised without calling a model.
 */
export function interpretReflection(
  reflectionText: string,
  reflectionCount: number
): ReflectionVerdict {
  const jsonMatch = reflectionText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn("[Reflection] Judge returned no parseable JSON");
    return unassessedReflection(reflectionCount);
  }

  let parsed: { overallScore?: unknown; issues?: unknown; suggestion?: unknown };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    logger.warn("[Reflection] Judge JSON did not parse");
    return unassessedReflection(reflectionCount);
  }

  // A judge that omits the score, or returns a non-number, has told us nothing.
  if (typeof parsed.overallScore !== "number" || !Number.isFinite(parsed.overallScore)) {
    logger.warn("[Reflection] Judge omitted a usable overallScore");
    return unassessedReflection(reflectionCount);
  }

  const score = Math.min(Math.max(parsed.overallScore / 100, 0), 1);
  const passes = score >= QUALITY_CONFIG.minScoreThreshold;

  return {
    qualityScore: score,
    qualityAssessed: true,
    qualityIssues: Array.isArray(parsed.issues) ? (parsed.issues as string[]) : [],
    reflectionFeedback:
      typeof parsed.suggestion === "string" ? parsed.suggestion : "",
    needsReflection:
      !passes && reflectionCount < QUALITY_CONFIG.maxReflectionRetries - 1,
    reflectionCount: reflectionCount + 1,
  };
}

// ============================================================================
// NODE: QUALITY GATE
// ============================================================================

async function qualityGateNode(state: SupervisorStateType) {
  const { qualityScore, qualityAssessed, intent, qualityIssues } = state;

  // Check if high-stakes intent requires human review.
  //
  // Only treat quality as low when it was actually measured. An unassessed
  // response has qualityScore 0, which would otherwise read as a failing grade
  // and route every unjudged high-stakes turn to human review.
  const isHighStakes = QUALITY_CONFIG.highStakesIntents.includes(intent);
  const lowQuality =
    qualityAssessed && qualityScore < QUALITY_CONFIG.minScoreThreshold;

  // Determine if human review is needed
  let requiresHumanReview = false;
  let humanReviewReason = "";

  if (isHighStakes && lowQuality) {
    requiresHumanReview = true;
    humanReviewReason = `High-stakes ${intent} with quality score ${(
      qualityScore * 100
    ).toFixed(0)}% below threshold. Issues: ${qualityIssues.join(", ")}`;
  }

  // Check for specific risk patterns in contract reviews
  if (intent === "review_contract") {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = String(lastMessage?.content || "").toLowerCase();

    if (
      content.includes("penale") ||
      content.includes("penalty") ||
      content.includes("unlimited liability") ||
      content.includes("responsabilità illimitata")
    ) {
      requiresHumanReview = true;
      humanReviewReason =
        "Contract contains high-risk clauses requiring expert review";
    }
  }

  console.log(
    `[QualityGate] Score: ${(qualityScore * 100).toFixed(
      0
    )}%, HumanReview: ${requiresHumanReview}`
  );

  return {
    requiresHumanReview,
    humanReviewReason,
  };
}

// NOTE: the human_review node was removed. Resuming an interrupted graph needs
// `new Command({ resume })` on the same thread plus a durable checkpointer and
// an endpoint to deliver it — none of which existed, so a triggered interrupt
// simply stalled the SSE stream with no way forward. The flags above are kept
// because formatNode surfaces them as metadata, and contract risk clauses
// still surface in the agent's own response.

// ============================================================================
// NODE: FORMAT OUTPUT
// ============================================================================

async function formatNode(state: SupervisorStateType) {
  // Add quality metadata to the final response
  const metadata = {
    qualityScore: state.qualityScore,
    agentUsed: state.agentUsed,
    executionTimeMs: state.executionTimeMs,
    reflectionCount: state.reflectionCount,
    humanReviewRequired: state.requiresHumanReview,
  };

  console.log(`[Format] Final metadata:`, metadata);

  return state;
}

// ============================================================================
// ROUTING LOGIC
// ============================================================================

function routeAfterAgent(state: SupervisorStateType): string {
  // If reflection is needed and we haven't exceeded retries
  if (
    state.needsReflection &&
    state.reflectionCount < QUALITY_CONFIG.maxReflectionRetries
  ) {
    return "reflection";
  }
  return "quality_gate";
}

function routeAfterReflection(state: SupervisorStateType): string {
  // If still needs reflection after critique, retry the agent
  if (
    state.needsReflection &&
    state.reflectionCount < QUALITY_CONFIG.maxReflectionRetries
  ) {
    return routeByIntent(state);
  }
  return "quality_gate";
}



// ============================================================================
// BUILD SUPERVISOR GRAPH
// ============================================================================

const supervisorGraph = new StateGraph(SupervisorState)
  // Classification node
  .addNode("classify", classifyNode)

  // Agent nodes
  .addNode(
    "search",
    createAgentNode(
      "search_agent",
      async () => {
        if (!searchAgentInstance) {
          searchAgentInstance = await searchAgent();
        }
        return searchAgentInstance;
      },
      AGENT_TIMEOUTS.search_agent
    )
  )
  .addNode(
    "analyze",
    createAgentNode(
      "analysis_agent",
      async () => {
        if (!analysisAgentInstance) {
          analysisAgentInstance = await analysisAgent();
        }
        return analysisAgentInstance;
      },
      AGENT_TIMEOUTS.analysis_agent
    )
  )
  .addNode(
    "personalize",
    createAgentNode(
      "personalization_agent",
      async () => {
        if (!personalizationAgentInstance) {
          personalizationAgentInstance = await personalizationAgent();
        }
        return personalizationAgentInstance;
      },
      AGENT_TIMEOUTS.personalization_agent
    )
  )
  .addNode(
    "rank",
    createAgentNode(
      "ranking_agent",
      async () => {
        if (!rankingAgentInstance) {
          rankingAgentInstance = await rankingAgent();
        }
        return rankingAgentInstance;
      },
      AGENT_TIMEOUTS.ranking_agent
    )
  )
  .addNode(
    "review_contract",
    createAgentNode(
      "contract_review_agent",
      async () => {
        if (!contractReviewAgentInstance) {
          contractReviewAgentInstance = await contractReviewAgent();
        }
        return contractReviewAgentInstance;
      },
      AGENT_TIMEOUTS.contract_review_agent
    )
  )

  // General/product questions
  .addNode("general", generalNode)

  // Quality control nodes
  .addNode("reflection", reflectionNode)
  .addNode("quality_gate", qualityGateNode)
  .addNode("format", formatNode)

  // Entry point
  .addEdge(START, "classify")

  // Route from classify to agents
  .addConditionalEdges("classify", routeByIntent, {
    search: "search",
    analyze: "analyze",
    rank: "rank",
    personalize: "personalize",
    review_contract: "review_contract",
    general: "general",
  })

  // Route from agents to reflection or quality gate
  .addConditionalEdges("search", routeAfterAgent, {
    reflection: "reflection",
    quality_gate: "quality_gate",
  })
  .addConditionalEdges("analyze", routeAfterAgent, {
    reflection: "reflection",
    quality_gate: "quality_gate",
  })
  .addConditionalEdges("personalize", routeAfterAgent, {
    reflection: "reflection",
    quality_gate: "quality_gate",
  })
  .addConditionalEdges("rank", routeAfterAgent, {
    reflection: "reflection",
    quality_gate: "quality_gate",
  })
  .addConditionalEdges("review_contract", routeAfterAgent, {
    reflection: "reflection",
    quality_gate: "quality_gate",
  })

  // Route from reflection
  .addConditionalEdges("reflection", routeAfterReflection, {
    search: "search",
    analyze: "analyze",
    rank: "rank",
    personalize: "personalize",
    review_contract: "review_contract",
    quality_gate: "quality_gate",
  })

  // Route from quality gate
  // The quality gate no longer branches: with human review gone, every path
  // out of it goes to formatting. `requiresHumanReview` is still computed and
  // surfaced as metadata, it just no longer changes control flow.
  .addEdge("quality_gate", "format")

  // General replies bypass reflection and the quality gate: no tools ran, so
  // there is no computed output to verify.
  .addEdge("general", "format")

  // Final edge
  .addEdge("format", END)

  ;

// ============================================================================
// COMPILATION
// ============================================================================

/**
 * The compiled graph, built once per process.
 *
 * Compilation is deferred because the checkpointer is resolved asynchronously
 * (it opens a Postgres connection and creates its tables on first use), and a
 * checkpointer can only be supplied at compile time. The previous code
 * compiled at module load with a MemorySaver and exposed a
 * `setSupervisorCheckpointer` setter — which could never take effect, since
 * the graph had already captured the saver by then.
 */
let compiled: ReturnType<typeof supervisorGraph.compile> | null = null;

export async function getSupervisor() {
  if (!compiled) {
    const checkpointer = await getCheckpointer();
    compiled = supervisorGraph.compile({
      name: "supervisor_graph_v2",
      checkpointer,
    });
  }
  return compiled;
}

// ============================================================================
// EXPORT UTILITIES
// ============================================================================

export { classifyIntent, routeByIntent, QUALITY_CONFIG };
