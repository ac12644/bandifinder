/**
 * Personalization Agent - Tailors recommendations to user preferences.
 */

import { createSpecializedAgent } from "./base";
import {
  getPersonalizedSuggestionsTool,
  updatePreferencesTool,
  getHistoryTool,
} from "./tools/personalization";

let personalizationAgentPromise: ReturnType<typeof createSpecializedAgent> | null = null;

export const personalizationAgent = async () => {
  if (!personalizationAgentPromise) {
    personalizationAgentPromise = createSpecializedAgent({
      name: "personalization_agent",
      modelTier: "small",
      tools: [
        getPersonalizedSuggestionsTool,
        updatePreferencesTool,
        getHistoryTool,
      ],
      prompt: `You are a personalization specialist for Bandifinder.it.

RESPONSIBILITIES:
- Generate personalized tender recommendations
- Learn from user preferences and history
- Adapt suggestions based on company profile
- Track and update user preferences

WORKFLOW:
1. Fetch user history and preferences
2. Generate personalized suggestions based on patterns
3. Rank results by relevance to user
4. Update preferences based on interactions

RESPONSE FORMAT:
{
  "suggestions": [
    {
      "tenderId": "...",
      "title": "...",
      "relevanceScore": 0-100,
      "reason": "Why this matches the user"
    }
  ],
  "message": "Italian summary of recommendations"
}

RULES:
- Prioritize user's past interests and industry
- Consider company size and capabilities
- Balance variety with relevance
- Respond in Italian`,
    });
  }
  return personalizationAgentPromise;
};
