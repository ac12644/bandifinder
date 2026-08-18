/**
 * Award Processor
 *
 * Links fetched Contract Award Notices to existing tenders in the database.
 * Updates tenders with award details (winner, value, bidder count).
 */

import { getSupabaseAdmin } from "../supabase";
import type { AwardRecord } from "./ted-award-connector";

export interface AwardProcessResult {
  awardsProcessed: number;
  tendersUpdated: number;
  tendersNotFound: number;
}

/**
 * Process award records by matching them to existing tenders and updating award fields.
 *
 * Matching strategy: Award notices reference their original tender by buyer + CPV + title similarity.
 * Since TED award notice publication numbers differ from the original CN publication numbers,
 * we match by buyer name + CPV code prefix (5 digits).
 */
export async function processAwards(
  awards: AwardRecord[]
): Promise<AwardProcessResult> {
  const sb = getSupabaseAdmin();
  let tendersUpdated = 0;
  let tendersNotFound = 0;

  for (const award of awards) {
    if (!award.winnerName) {
      // No winner info — skip
      tendersNotFound++;
      continue;
    }

    try {
      // Try to find matching tender by buyer + CPV prefix + title similarity
      // First: exact buyer match + CPV overlap
      const cpvPrefix = award.cpvCodes[0]?.substring(0, 5);
      let query = sb
        .from("tenders")
        .select("id, title, award_status")
        .eq("award_status", "open")
        .ilike("buyer", `%${award.buyer.substring(0, 50)}%`);

      if (cpvPrefix) {
        // Use text search on cpv_codes array
        query = query.contains("cpv_codes", [award.cpvCodes[0]]);
      }

      const { data: matches, error } = await query.limit(5);

      if (error) {
        console.error(`[AwardProcessor] Query error for ${award.awardNoticeId}:`, error.message);
        tendersNotFound++;
        continue;
      }

      if (!matches || matches.length === 0) {
        tendersNotFound++;
        continue;
      }

      // Pick the best match by title similarity (simple word overlap)
      const bestMatch = findBestTitleMatch(award.title, matches);

      if (!bestMatch) {
        tendersNotFound++;
        continue;
      }

      // Update the tender with award data
      const { error: updateError } = await sb
        .from("tenders")
        .update({
          award_status: "awarded",
          award_winner_name: award.winnerName,
          award_winner_country: award.winnerCountry || null,
          award_value: award.awardValue || null,
          award_date: award.awardDate || null,
          award_num_tenders_received: award.numTendersReceived || null,
          award_notice_id: award.awardNoticeId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bestMatch.id);

      if (updateError) {
        console.error(`[AwardProcessor] Update error for tender ${bestMatch.id}:`, updateError.message);
        tendersNotFound++;
        continue;
      }

      tendersUpdated++;
    } catch (err) {
      console.error(`[AwardProcessor] Error processing award ${award.awardNoticeId}:`, err);
      tendersNotFound++;
    }
  }

  return {
    awardsProcessed: awards.length,
    tendersUpdated,
    tendersNotFound,
  };
}

/** Find the best title match using word overlap scoring */
function findBestTitleMatch(
  awardTitle: string,
  candidates: Array<{ id: string; title: string; award_status: string }>
): { id: string; title: string } | null {
  const awardWords = new Set(
    awardTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );

  if (awardWords.size === 0) return candidates[0] || null;

  let bestScore = 0;
  let bestMatch: { id: string; title: string } | null = null;

  for (const candidate of candidates) {
    const candidateWords = candidate.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);

    let overlap = 0;
    for (const word of candidateWords) {
      if (awardWords.has(word)) overlap++;
    }

    const score = overlap / Math.max(awardWords.size, 1);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  // Require at least 20% word overlap
  return bestScore >= 0.2 ? bestMatch : candidates[0] || null;
}
