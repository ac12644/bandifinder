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
        const seenMessageIds = new Set<string>();

        // Process stream chunks
        for await (const chunk of agentStream) {
          let messages: unknown[] = [];

          // Handle different chunk formats
          if (chunk && typeof chunk === "object") {
            if ("messages" in chunk && Array.isArray(chunk.messages)) {
              messages = chunk.messages;
            } else if (Array.isArray(chunk)) {
              messages = chunk;
            } else {
              messages = [chunk];
            }
          }

          for (const message of messages) {
            const msgType = getMessageType(message);
            const content = extractContent(message);

            // Create unique ID to avoid duplicates
            const contentStr = content?.substring(0, 100) || "";
            const msgId = `${msgType}-${contentStr}`;

            if (!seenMessageIds.has(msgId)) {
              seenMessageIds.add(msgId);
              allMessages.push(message);
            }

            // Only stream AI messages, not tool outputs
            // Skip content that looks like raw JSON or tender data
            const isToolMessage = msgType === "tool";
            const isRawJson =
              content &&
              (content.trim().startsWith("{") ||
                content.trim().startsWith("[") ||
                content.includes('"tenders"') ||
                content.includes('"query"') ||
                content.includes('"publicationNumber"') ||
                content.includes('"noticeId"') ||
                content.includes("publication-date") ||
                content.includes("publication-number") ||
                // Skip partial/garbled content
                content.includes("FT~") ||
                content.includes("AND ") ||
                // Skip if it contains JSON-like patterns
                /"\w+":\s*["\[\{]/.test(content));

            // Send incremental content updates (only for clean AI text)
            if (
              content &&
              !isToolMessage &&
              !isRawJson &&
              content.length > accumulatedContent.length &&
              // Only send if content is meaningful (not just fragments)
              content.length > 10
            ) {
              const newContent = content.slice(accumulatedContent.length);
              // Only send if the new content is clean text
              if (newContent && !newContent.includes('"') && !newContent.startsWith("{")) {
                await stream.writeSSE({
                  data: JSON.stringify({ content: newContent, done: false }),
                });
                accumulatedContent = content;
              }
            }
          }
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
