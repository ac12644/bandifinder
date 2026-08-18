/**
 * Scoring Engine
 *
 * Orchestrates all scoring components for a tender-company pair.
 * Produces the data structure expected by the frontend:
 * { overallScore, recommendation, components, eligibility }
 */

import type { DbCompanyProfile } from "../db/company-profiles";
import type { DbTender } from "../db/tenders";
import {
  scoreCpvMatch,
  scoreRevenueFit,
  scoreGeographicMatch,
  scoreCertificationMatch,
  scoreExperienceMatch,
  scoreDeadlineFeasibility,
  type ScoreResult,
} from "./components";
import { checkEligibility, type EligibilityItem } from "./compliance";

export interface ScoringResult {
  overallScore: number;
  recommendation: "BID" | "REVIEW" | "SKIP";
  components: ScoreResult[];
  eligibility: EligibilityItem[];
}

/**
 * Run all scoring components and produce a complete analysis.
 */
export function scoreTender(
  tender: DbTender,
  profile: DbCompanyProfile | null
): ScoringResult {
  // If no profile, return minimal scoring
  if (!profile) {
    return {
      overallScore: 0,
      recommendation: "REVIEW",
      components: [],
      eligibility: checkEligibility(tender, null),
    };
  }

  // Run all 6 components
  const components: ScoreResult[] = [
    scoreCpvMatch(tender, profile),
    scoreRevenueFit(tender, profile),
    scoreGeographicMatch(tender, profile),
    scoreCertificationMatch(tender, profile),
    scoreExperienceMatch(tender, profile),
    scoreDeadlineFeasibility(tender, profile),
  ];

  // Calculate overall score (weighted sum / total max * 100)
  const totalScore = components.reduce((sum, c) => sum + c.score, 0);
  const totalMax = components.reduce((sum, c) => sum + c.maxScore, 0);
  const overallScore = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  // Determine recommendation
  const recommendation = deriveRecommendation(overallScore, components, tender);

  // Run eligibility check
  const eligibility = checkEligibility(tender, profile);

  return {
    overallScore,
    recommendation,
    components,
    eligibility,
  };
}

/**
 * Quick score for search results (lighter, no eligibility check).
 * Returns just the overall score and recommendation.
 */
export function quickScore(
  tender: DbTender,
  profile: DbCompanyProfile
): { overallScore: number; recommendation: "BID" | "REVIEW" | "SKIP" } {
  const components = [
    scoreCpvMatch(tender, profile),
    scoreRevenueFit(tender, profile),
    scoreGeographicMatch(tender, profile),
    scoreCertificationMatch(tender, profile),
  ];

  const totalScore = components.reduce((sum, c) => sum + c.score, 0);
  const totalMax = components.reduce((sum, c) => sum + c.maxScore, 0);
  const overallScore = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  const recommendation = deriveRecommendation(overallScore, components, tender);

  return { overallScore, recommendation };
}

/**
 * Derive recommendation from score + context.
 */
function deriveRecommendation(
  overallScore: number,
  components: ScoreResult[],
  tender: DbTender
): "BID" | "REVIEW" | "SKIP" {
  // Expired deadline = always SKIP
  if (tender.deadline) {
    const daysLeft = Math.ceil(
      (new Date(tender.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysLeft < 0) return "SKIP";
  }

  // Check for critical failures (CPV = 0 is a strong signal)
  const cpvComponent = components.find((c) => c.name === "Corrispondenza CPV");
  if (cpvComponent && cpvComponent.score === 0 && cpvComponent.maxScore > 0) {
    if (overallScore < 50) return "SKIP";
  }

  if (overallScore >= 70) return "BID";
  if (overallScore >= 40) return "REVIEW";
  return "SKIP";
}
