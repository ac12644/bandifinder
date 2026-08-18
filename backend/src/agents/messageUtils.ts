/**
 * Message Utilities
 *
 * Helpers for normalizing and converting messages between formats.
 */

import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
} from "@langchain/core/messages";

export interface IncomingMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Normalize incoming messages by cleaning content.
 */
export function normalizeIncoming(messages: IncomingMessage[]): IncomingMessage[] {
  return messages
    .filter((m) => m && m.content && typeof m.content === "string")
    .map((m) => ({
      role: m.role,
      content: m.content.trim(),
    }));
}

/**
 * Convert simple messages to LangChain message format.
 */
export function toLCMessages(messages: IncomingMessage[]): BaseMessage[] {
  return messages.map((m) => {
    switch (m.role) {
      case "user":
        return new HumanMessage(m.content);
      case "assistant":
        return new AIMessage(m.content);
      case "system":
        return new SystemMessage(m.content);
      default:
        return new HumanMessage(m.content);
    }
  });
}

/**
 * Convert LangChain messages back to simple format.
 */
export function fromLCMessages(messages: BaseMessage[]): IncomingMessage[] {
  return messages.map((m) => {
    const type = getMessageType(m);
    return {
      role: type === "human" ? "user" : type === "ai" ? "assistant" : "system",
      content: extractContent(m),
    };
  });
}

/**
 * Get message type from LangChain message.
 */
function getMessageType(message: BaseMessage): string {
  if (typeof (message as { _getType?: () => string })._getType === "function") {
    return (message as { _getType: () => string })._getType();
  }
  return (message as { type?: string }).type || "unknown";
}

/**
 * Extract content from LangChain message.
 */
function extractContent(message: BaseMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((p) => {
        if (typeof p === "string") return p;
        const part = p as { text?: string; content?: string };
        return part?.text || part?.content || "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}
