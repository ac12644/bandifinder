/**
 * Agent Routes
 *
 * AI agent endpoints with streaming support for real-time responses.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../app";
import { getSupervisor } from "../agents/supervisor";
import { normalizeIncoming, toLCMessages } from "../agents/messageUtils";
import { formatStructuredResponse } from "../agents/responseFormatter";

export const agentRoutes = new Hono<Env>();

// Request schemas
const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })
  ),
  thread_id: z.string().optional(),
});

/**
 * POST /agent/stream
 *
 * Streaming chat endpoint using Server-Sent Events.
 * Provides real-time token-by-token responses for optimal UX.
 */
agentRoutes.post(
  "/stream",
  zValidator("json", chatRequestSchema),
  async (c) => {
    const { messages, thread_id } = c.req.valid("json");
    const userId = c.get("userId") || "anon";

    return streamSSE(c, async (stream) => {
      try {
        // Normalize incoming messages
        const cleaned = normalizeIncoming(
          messages as {
            role: "user" | "assistant" | "system";
            content: string;
          }[]
        );
        const userMsgs = cleaned.filter(
          (m) => m.role === "user" || m.role === "assistant"
        );

        if (!userMsgs.some((m) => m.role === "user" && m.content)) {
          await stream.writeSSE({
            data: JSON.stringify({ error: "No user message provided" }),
          });
          return;
        }

        // Inject server date for context
        const today = new Date().toISOString().split("T")[0];
        const withDate = [
          { role: "user" as const, content: `Current date: ${today}` },
          ...userMsgs,
        ];

        // Convert to LangChain messages
        const lcMessages = toLCMessages(withDate);
        const finalThreadId = thread_id || `thread-${userId}-${Date.now()}`;

        // Stream agent response
        const supervisor = await getSupervisor();
        const agentStream = await supervisor.stream(
          { messages: lcMessages },
          {
            configurable: {
              thread_id: finalThreadId,
              user_id: userId !== "anon" ? userId : undefined,
            },
            streamMode: "messages",
          }
        );

        let accumulatedContent = "";
        const allMessages: unknown[] = [];

        // `streamMode: "messages"` yields [messageChunk, metadata] tuples, and
        // each AI chunk's `content` is a *token delta* — not the message so
        // far. This previously treated deltas as cumulative and emitted
        // `content.slice(accumulatedContent.length)`, which sliced mid-token
        // against an ever-growing offset and shipped fragments like
        // "erstvo financ" (the middle of "Ministerstvo financi") to the UI.
        // Deltas are appended, not sliced.
        //
        // Chunks are also keyed by message id, which is stable across the
        // chunks of one message, so a run that produces several AI messages
        // (tool-calling turns, then the answer) keeps them separate.
        const aiMessages = new Map<string, string>();

        for await (const chunk of agentStream) {
          // The tuple's second element is metadata, not a message.
          const message = Array.isArray(chunk) ? chunk[0] : chunk;
          const msgType = getMessageType(message);
          const content = extractContent(message);

          // Tool outputs carry the structured tender payload the final frame
          // needs, but must never reach the user as prose.
          if (msgType === "tool") {
            allMessages.push(message);
            continue;
          }

          if (msgType !== "ai" || !content) continue;

          const id = (message as { id?: string })?.id ?? "default";
          const soFar = (aiMessages.get(id) ?? "") + content;
          aiMessages.set(id, soFar);

          // Some agents are prompted to answer in JSON (ranking returns
          // `rankedTenders`, contract review returns an analysis object). That
          // is payload for the final frame, not prose, so it is accumulated but
          // never streamed. The decision is stable: it depends only on the
          // first non-whitespace character of the message.
          const trimmed = soFar.trimStart();
          if (trimmed.startsWith("{") || trimmed.startsWith("[")) continue;

          accumulatedContent += content;
          await stream.writeSSE({
            data: JSON.stringify({ content, done: false }),
          });
        }

        // Hand the formatter whole messages, not the token fragments: it
        // JSON-parses each one to pull out tenders.
        for (const [, text] of aiMessages) {
          allMessages.push({ type: "ai", content: text });
        }

        // Format structured response with tender data
        const structuredResponse = formatStructuredResponse(
          allMessages,
          accumulatedContent
        );

        // Send completion with structured data
        await stream.writeSSE({
          data: JSON.stringify({
            done: true,
            thread_id: finalThreadId,
            ...(structuredResponse.tenders
              ? { tenders: structuredResponse.tenders }
              : {}),
            ...(structuredResponse.contractReview
              ? { contractReview: structuredResponse.contractReview }
              : {}),
            ...(structuredResponse.metadata
              ? { metadata: structuredResponse.metadata }
              : {}),
          }),
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[Agent Stream Error]", error);
        await stream.writeSSE({
          data: JSON.stringify({ error: errorMessage, done: true }),
        });
      }
    });
  }
);

/**
 * POST /agent/chat
 *
 * Non-streaming chat endpoint for simple request/response.
 */
agentRoutes.post("/chat", zValidator("json", chatRequestSchema), async (c) => {
  const { messages, thread_id } = c.req.valid("json");
  const userId = c.get("userId") || "anon";

  try {
    const cleaned = normalizeIncoming(
      messages as { role: "user" | "assistant" | "system"; content: string }[]
    );
    const userMsgs = cleaned.filter(
      (m) => m.role === "user" || m.role === "assistant"
    );

    if (!userMsgs.some((m) => m.role === "user" && m.content)) {
      return c.json({ error: "No user message provided" }, 400);
    }

    const today = new Date().toISOString().split("T")[0];
    const withDate = [
      { role: "user" as const, content: `Current date: ${today}` },
      ...userMsgs,
    ];

    const lcMessages = toLCMessages(withDate);
    const finalThreadId = thread_id || `thread-${userId}-${Date.now()}`;

    // Invoke agent (non-streaming)
    const supervisor = await getSupervisor();
    const result = await supervisor.invoke(
      { messages: lcMessages },
      {
        configurable: {
          thread_id: finalThreadId,
          user_id: userId !== "anon" ? userId : undefined,
        },
      }
    );

    // Extract response
    const lastMessage = result.messages?.[result.messages.length - 1];
    const content = extractContent(lastMessage);

    const structuredResponse = formatStructuredResponse(
      result.messages || [],
      content || ""
    );

    return c.json({
      content,
      thread_id: finalThreadId,
      ...structuredResponse,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[Agent Chat Error]", error);
    return c.json({ error: errorMessage }, 500);
  }
});

/**
 * GET /agent/health
 *
 * Health check for agent system.
 */
agentRoutes.get("/health", (c) => {
  return c.json({
    status: "ok",
    agents: [
      "search",
      "analysis",
      "ranking",
      "personalization",
      "contractReview",
    ],
  });
});

// Helper functions

function extractContent(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;

  const msg = message as { content?: unknown };

  if (typeof msg.content === "string") {
    return msg.content;
  }

  if (Array.isArray(msg.content)) {
    return msg.content
      .map((p) => {
        if (typeof p === "string") return p;
        const part = p as { text?: string; content?: string };
        return part?.text || part?.content || "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return null;
}

function getMessageType(message: unknown): string {
  if (!message || typeof message !== "object") return "unknown";

  const msg = message as { _getType?: () => string; type?: string };

  if (typeof msg._getType === "function") {
    return msg._getType();
  }

  return msg.type || "unknown";
}
