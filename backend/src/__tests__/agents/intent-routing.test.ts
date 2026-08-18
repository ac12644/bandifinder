/**
 * Intent classification and routing
 *
 * classifyIntent could return "general" and "unknown", but neither appeared in
 * routeByIntent's map, so both fell through to `|| "search"`. A user asking
 * what the product does received a tender search — and because "servizi" and
 * "software" sit in the search keyword list, phrases like "che servizi
 * offrite?" were classified as searches outright.
 */

import { describe, it, expect } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { classifyIntent, routeByIntent, type UserIntent } from "../../agents/supervisor";

const classify = (text: string) => classifyIntent([new HumanMessage(text)]);

/** Where a message ends up after classification. */
const routeFor = (text: string) =>
  routeByIntent({ intent: classify(text) } as never);

describe("product questions are not tender searches", () => {
  it.each([
    "Cosa puoi fare?",
    "Come funziona Bandifinder?",
    "Chi sei?",
    "Che servizi offrite?",
    "A cosa serve questa piattaforma?",
    "Ciao",
    "Buongiorno",
    "aiuto",
    "Grazie!",
  ])("classifies %j as general", (text) => {
    expect(classify(text)).toBe("general");
  });

  it("routes a product question to the general node, not the search agent", () => {
    // The expensive failure: a greeting triggering a full search agent run
    // with its TED and vector calls.
    expect(routeFor("Che servizi offrite?")).toBe("general");
    expect(routeFor("Ciao")).toBe("general");
  });
});

describe("tender intents still classify correctly", () => {
  it.each([
    ["Trova bandi per software in Lombardia", "search"],
    ["Cerca appalti sanità", "search"],
    ["Mostra le gare aperte", "search"],
    ["Analizza questo bando", "analyze"],
    ["Qual è il punteggio di compatibilità?", "analyze"],
    ["Rivedi le clausole del contratto", "review_contract"],
    ["Quali sono i rischi contrattuali?", "review_contract"],
    ["Dammi una shortlist", "rank"],
    ["Ordina per priorità", "rank"],
    ["Dammi dei suggerimenti", "personalize"],
  ])("classifies %j as %s", (text, expected) => {
    expect(classify(text)).toBe(expected as UserIntent);
  });

  it("still sends a real search to the search agent", () => {
    expect(routeFor("Trova bandi per software in Lombardia")).toBe("search");
  });
});

describe("routeByIntent covers every declared intent", () => {
  const ALL: UserIntent[] = [
    "search",
    "analyze",
    "personalize",
    "rank",
    "review_contract",
    "general",
    "unknown",
  ];

  it.each(ALL)("%s maps to a node explicitly", (intent) => {
    const node = routeByIntent({ intent } as never);
    expect(node).toBeTruthy();
    // Only a genuine search intent may reach the search agent.
    if (intent !== "search") expect(node).not.toBe("search");
  });

  it("sends unknown to general rather than to search", () => {
    expect(routeByIntent({ intent: "unknown" } as never)).toBe("general");
  });

  it("falls back to general for an unrecognised value", () => {
    expect(routeByIntent({ intent: "something-new" } as never)).toBe("general");
  });
});

describe("empty input", () => {
  it("classifies a message with no content as unknown", () => {
    expect(classifyIntent([])).toBe("unknown");
    expect(classifyIntent([new HumanMessage("")])).toBe("unknown");
  });
});
