/**
 * AI Explainability Components
 *
 * Components for transparent AI decision-making:
 * - QualityScoreBadge: Visual quality indicator
 * - ReflectionFeedback: Shows AI self-improvement process
 * - AIExplainabilityCard: Full decision context card
 *
 * Usage:
 * ```tsx
 * import { AIExplainabilityCard, QualityScoreBadge } from "@/components/explainability";
 *
 * <QualityScoreBadge score={0.85} />
 *
 * <AIExplainabilityCard
 *   metadata={{
 *     agentUsed: "search",
 *     qualityScore: 0.85,
 *     reflectionCount: 1,
 *     executionTimeMs: 2500,
 *   }}
 * />
 * ```
 */

export { QualityScoreBadge } from "./QualityScoreBadge";
export { ReflectionFeedback } from "./ReflectionFeedback";
export {
  AIExplainabilityCard,
  type AIMetadata,
} from "./AIExplainabilityCard";
