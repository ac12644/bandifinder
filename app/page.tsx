"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import { useAgentStream } from "./hooks/useAgentStream";
import { useAgentState } from "./hooks/useAgentState";
import { AgentStatus } from "./components/AgentStatus";
import { ChatMessages, type ChatMsg } from "./components/ChatMessages";
import { ChatInput } from "./components/ChatInput";
import { SuggestionsPanel } from "./components/SuggestionsPanel";
import { InlineModelSelector, type LLMProvider } from "./components/ModelSelector";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import type { AnalysisResult } from "./components/ProgressiveTenderCard";

import { API_BASE_URL, ENDPOINTS } from "@/lib/apiConfig";

/* -------------------------------------------------------
 * Suggestion Management
 * ----------------------------------------------------- */
const SUGG_KEY = "tender_last_prompts";
const AI_SUGG_KEY = "tender_ai_suggestions";

function rememberPrompt(p: string) {
  try {
    const raw = localStorage.getItem(SUGG_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    const out = [p, ...arr.filter((x) => x !== p)].slice(0, 6);
    localStorage.setItem(SUGG_KEY, JSON.stringify(out));
  } catch {}
}

function loadSuggestions(): string[] {
  try {
    const raw = localStorage.getItem(SUGG_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function loadAISuggestions(): string[] {
  try {
    const raw = localStorage.getItem(AI_SUGG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Handle both string arrays and object arrays (legacy format)
    return parsed.map((item: unknown) =>
      typeof item === "string" ? item : (item as { text?: string })?.text || ""
    ).filter(Boolean);
  } catch {
    return [];
  }
}

function saveAISuggestions(suggestions: string[]) {
  try {
    localStorage.setItem(AI_SUGG_KEY, JSON.stringify(suggestions));
  } catch {}
}

async function fetchAISuggestions(
  uid: string | null,
  idToken: string | null,
  context?: string
): Promise<string[]> {
  try {
    const headers: HeadersInit = {
      "x-user-id": uid ?? "anon",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      "Content-Type": "application/json",
    };

    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.suggestions}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: context,
        limit: 4,
      }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.suggestions || [];
  } catch (error) {
    console.warn("Failed to fetch AI suggestions:", error);
    return [];
  }
}

async function fetchPersonalizedSuggestions(
  uid: string | null,
  idToken: string | null
): Promise<string[]> {
  if (!uid || uid === "anon") return [];

  try {
    const headers: HeadersInit = {
      "x-user-id": uid,
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      "Content-Type": "application/json",
    };

    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.personalizedRecommendations}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ limit: 4 }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.suggestions || [];
  } catch (error) {
    console.warn("Failed to fetch personalized suggestions:", error);
    return [];
  }
}

/* -------------------------------------------------------
 * Main Page Component
 * ----------------------------------------------------- */
export default function HomePage() {
  const { uid, idToken, loading: authLoading } = useAuth();

  // Streaming hook
  const {
    content: streamingContent,
    isStreaming,
    error: streamError,
    threadId: streamThreadId,
    tenders: streamingTenders,
    contractReview: streamContractReview,
    explainability: streamExplainability,
    graphrag: streamGraphrag,
    stream,
    reset: resetStream,
  } = useAgentStream();

  // Agent state detection
  const agentState = useAgentState(streamingContent, isStreaming);

  // Chat state
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Ciao! Sono Bandifinder.it, il tuo assistente AI per trovare i bandi pubblici più adatti alla tua azienda. Dimmi cosa cerchi (es: *software* oggi in *Lombardia*).",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<string[]>(loadSuggestions());
  const [aiSuggestions, setAiSuggestions] = useState<string[]>(loadAISuggestions());
  const [personalizedSuggestions, setPersonalizedSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Model selection state
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>("gemini");
  const [selectedModel, setSelectedModel] = useState("gemini-2.0-flash");

  // Analysis state
  const [analyzingTender, setAnalyzingTender] = useState<string | null>(null);

  // Eligibility analysis handler
  async function analyzeEligibility(
    tenderId: string,
    tenderData?: {
      title?: string;
      buyer?: string;
      cpv?: string | string[];
      deadline?: string;
      value?: number;
    }
  ): Promise<AnalysisResult | null> {
    if (!uid || uid === "anon") {
      toast.info("Devi essere loggato per analizzare l'eligibilità");
      return null;
    }

    setAnalyzingTender(tenderId);
    try {
      toast.info("Analisi in corso...", {
        description: "Sto analizzando l'eligibilità del bando",
        duration: 2000,
      });

      const headers: HeadersInit = {
        "x-user-id": uid,
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        "Content-Type": "application/json",
      };

      const response = await fetch(`${API_BASE_URL}${ENDPOINTS.analyzeEligibility}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ tenderId, ...(tenderData ? { tenderData } : {}) }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      if (data && data.eligible !== undefined) {
        const score = Math.round((data.eligibilityScore || 0) * 100);
        toast.success("Analisi completata!", {
          description: `Eligibilità: ${score}% - ${data.eligible ? "Eligibile" : "Non eligibile"}`,
          duration: 5000,
        });

        return {
          eligible: data.eligible ?? false,
          eligibilityScore: data.eligibilityScore ?? 0,
          reasons: data.reasons ?? [],
          riskFactors: data.riskFactors ?? [],
          opportunities: data.opportunities ?? [],
          missingRequirements: data.missingRequirements ?? [],
          recommendation: data.recommendation ?? "skip",
        };
      }
      return null;
    } catch (error) {
      console.error("Error analyzing eligibility:", error);
      toast.error("Errore durante l'analisi", { description: "Riprova più tardi", duration: 3000 });
      return null;
    } finally {
      setAnalyzingTender(null);
    }
  }

  // Load AI suggestions on mount
  useEffect(() => {
    const loadAISuggestionsAsync = async () => {
      if (authLoading) return;

      setLoadingSuggestions(true);
      try {
        const generalSuggestions = await fetchAISuggestions(uid, idToken);
        if (generalSuggestions.length > 0) {
          setAiSuggestions(generalSuggestions);
          saveAISuggestions(generalSuggestions);
        }

        if (uid && uid !== "anon") {
          const personalized = await fetchPersonalizedSuggestions(uid, idToken);
          if (personalized.length > 0) {
            setPersonalizedSuggestions(personalized);
          }
        }
      } catch (error) {
        console.warn("Failed to load AI suggestions:", error);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    loadAISuggestionsAsync();
  }, [uid, idToken, authLoading, suggestions]);

  // Add streaming content to messages when complete
  useEffect(() => {
    if (!isStreaming && streamingContent && streamingContent.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role !== "assistant" || lastMessage.content !== streamingContent) {
        setMessages((prev) => [...prev, { role: "assistant", content: streamingContent }]);

        // Generate contextual suggestions
        const lastUserMessage = messages.filter((m) => m.role === "user").pop()?.content;
        if (lastUserMessage) {
          fetchAISuggestions(uid, idToken, `User searched for: ${lastUserMessage}. Generate related suggestions.`)
            .then((contextualSuggestions) => {
              if (contextualSuggestions.length > 0) {
                setAiSuggestions(contextualSuggestions);
                saveAISuggestions(contextualSuggestions);
              }
            })
            .catch(console.warn);
        }
      }
    }
  }, [isStreaming, streamingContent, messages, uid, idToken]);

  // Auto-scroll using viewport ref
  useEffect(() => {
    if (scrollViewportRef.current) {
      const viewport = scrollViewportRef.current.querySelector('[data-slot="scroll-area-viewport"]');
      if (viewport) {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, [messages, loading, streamingContent, isStreaming]);

  // Send message
  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;

    rememberPrompt(content);
    setSuggestions(loadSuggestions());

    const userMessage: ChatMsg = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    resetStream();

    try {
      const messagesToSend = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        userMessage,
      ] as Array<{ role: string; content: string }>;

      await stream(messagesToSend, streamThreadId || undefined, selectedProvider, selectedModel);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [...prev, { role: "assistant", content: `Errore: ${message}` }]);
    } finally {
      setLoading(false);
    }
  }

  const firstUserIndex = React.useMemo(
    () => messages.findIndex((m) => m.role === "user"),
    [messages]
  );

  const showSuggestions =
    firstUserIndex === -1 ||
    (messages[messages.length - 1]?.role === "assistant" && input.trim() === "");

  return (
    <div className="h-[calc(100vh-4rem)] w-full bg-gradient-to-b from-gray-50 to-white">
      <div className="mx-auto h-full w-full max-w-4xl px-4">
        <div className="flex h-full flex-col">
          {/* Messages Area with ScrollArea */}
          <ScrollArea
            ref={scrollViewportRef}
            className="flex-1 overflow-hidden"
          >
            <div className="space-y-4 pb-6 pt-4 px-1">
              <ChatMessages
                messages={messages}
                streamingContent={streamingContent}
                streamingTenders={streamingTenders}
                streamContractReview={streamContractReview}
                isStreaming={isStreaming}
                analyzeEligibility={analyzeEligibility}
                analyzingTender={analyzingTender}
                explainability={streamExplainability}
                graphrag={streamGraphrag}
              />

              <SuggestionsPanel
                suggestions={suggestions}
                aiSuggestions={aiSuggestions}
                personalizedSuggestions={personalizedSuggestions}
                onPick={(s) => !loading && send(s)}
                loading={loadingSuggestions}
                disabled={loading}
                showSuggestions={showSuggestions}
              />

              {/* Agent status */}
              {(loading || isStreaming) && (
                <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <AgentStatus state={agentState} />
                </div>
              )}

              {/* Error display */}
              {streamError && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{streamError}</AlertDescription>
                  </Alert>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input Footer */}
          <div className="space-y-2 pb-2">
            <div className="flex items-center justify-between px-1">
              <InlineModelSelector
                provider={selectedProvider}
                model={selectedModel}
                onProviderChange={setSelectedProvider}
                onModelChange={setSelectedModel}
                disabled={loading || isStreaming}
              />
            </div>
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={() => send()}
              loading={loading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
