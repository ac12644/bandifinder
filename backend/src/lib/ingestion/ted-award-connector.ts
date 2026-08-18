/**
 * TED Award Connector
 *
 * Fetches Contract Award Notices (CAN) from the TED API v3.
 * Award notices contain winner name, award value, and bidder count.
 * These are linked to existing tenders to populate competitive intelligence.
 */

import type { TEDNotice, TEDSearchResponse, I18nString } from "../types";
import type { FetchOptions } from "./connector";

const TED_API_BASE = "https://api.ted.europa.eu/v3";

/** Fields specific to award notices */
const AWARD_FIELDS = [
  "publication-number",
  "notice-identifier",
  "notice-title",
  "buyer-name",
  "publication-date",
  "classification-cpv",
  "organisation-country-buyer",
  "place-of-performance-country-proc",
  "winner-name",
  "winner-country-name",
  "total-value",
  "award-contract-value",
  "nb-tenders-received-lot",
  "award-date",
  "contract-nature-main-proc",
  "contract-nature-main-lot",
];

/** Parsed award record */
export interface AwardRecord {
  /** Publication number of the award notice itself */
  awardNoticeId: string;
  /** Title of the tender */
  title: string;
  /** Buyer name */
  buyer: string;
  /** Winner/contractor name */
  winnerName: string | undefined;
  /** Winner country */
  winnerCountry: string | undefined;
  /** Award value */
  awardValue: number | undefined;
  /** Number of tenders received */
  numTendersReceived: number | undefined;
  /** Date of award */
  awardDate: string | undefined;
  /** CPV codes */
  cpvCodes: string[];
  /** Country */
  country: string | undefined;
  /** Publication date of the award notice */
  publicationDate: string | undefined;
}

/** Result of fetching awards */
export interface AwardFetchResult {
  awards: AwardRecord[];
  totalAvailable: number;
}

/** Extract first value from I18nString, preferring Italian */
function extractI18n(field: I18nString | undefined, fallback: string = ""): string {
  if (!field) return fallback;
  const ita = field.ita;
  if (Array.isArray(ita) && ita[0]) return ita[0];
  if (typeof ita === "string") return ita;
  const eng = field.eng;
  if (Array.isArray(eng) && eng[0]) return eng[0];
  if (typeof eng === "string") return eng;
  return fallback;
}

/** Transform a TED notice into an AwardRecord */
function transformAwardNotice(notice: TEDNotice): AwardRecord | null {
  const pubNumber = notice["publication-number"];
  if (!pubNumber) return null;

  const title = extractI18n(notice["notice-title"], "Untitled");
  const buyer = extractI18n(notice["buyer-name"], "Unknown");

  // Winner name — can be I18nString or plain string
  const winnerRaw = notice["winner-name"];
  let winnerName: string | undefined;
  if (typeof winnerRaw === "string") {
    winnerName = winnerRaw;
  } else if (winnerRaw && typeof winnerRaw === "object") {
    winnerName = extractI18n(winnerRaw as I18nString) || undefined;
  }

  // Winner country
  const winnerCountryRaw = notice["winner-country-name"];
  let winnerCountry: string | undefined;
  if (typeof winnerCountryRaw === "string") {
    winnerCountry = winnerCountryRaw;
  } else if (winnerCountryRaw && typeof winnerCountryRaw === "object") {
    winnerCountry = extractI18n(winnerCountryRaw as I18nString) || undefined;
  }

  // Award value
  const awardValue =
    (notice["award-contract-value"] as number | undefined) ||
    notice["total-value"] ||
    undefined;

  // Number of tenders received
  const nbTendersRaw = notice["nb-tenders-received-lot"];
  const numTendersReceived = typeof nbTendersRaw === "number"
    ? nbTendersRaw
    : Array.isArray(nbTendersRaw) && typeof nbTendersRaw[0] === "number"
      ? nbTendersRaw[0]
      : undefined;

  // Award date
  const awardDateRaw = notice["award-date"];
  const awardDate = typeof awardDateRaw === "string"
    ? awardDateRaw
    : Array.isArray(awardDateRaw) && typeof awardDateRaw[0] === "string"
      ? awardDateRaw[0]
      : undefined;

  // Publication date
  const pubDate = Array.isArray(notice["publication-date"])
    ? notice["publication-date"][0]
    : notice["publication-date"];

  // CPV codes
  const cpvRaw = notice["classification-cpv"];
  const cpvCodes = Array.isArray(cpvRaw)
    ? cpvRaw
    : cpvRaw
      ? [cpvRaw]
      : [];

  // Country
  const countryBuyer = notice["organisation-country-buyer"];
  const country = Array.isArray(countryBuyer)
    ? countryBuyer[0]
    : countryBuyer || notice["place-of-performance-country-proc"];

  return {
    awardNoticeId: pubNumber,
    title,
    buyer,
    winnerName,
    winnerCountry,
    awardValue: typeof awardValue === "number" ? awardValue : undefined,
    numTendersReceived,
    awardDate,
    cpvCodes: cpvCodes as string[],
    country: country as string | undefined,
    publicationDate: pubDate as string | undefined,
  };
}

/** Build TED expert query for award notices */
function buildAwardQuery(options: FetchOptions): string {
  const parts: string[] = [];

  // Filter to Contract Award Notices only (TD=3)
  parts.push("TD=3");

  if (options.country) {
    parts.push(`organisation-country-buyer=${options.country}`);
  }
  if (options.cpvCodes && options.cpvCodes.length > 0) {
    const cpvQuery = options.cpvCodes.map((c) => `CPV="${c}"`).join(" OR ");
    parts.push(`(${cpvQuery})`);
  }
  if (options.dateFrom) {
    parts.push(`publication-date>=${options.dateFrom.replace(/-/g, "")}`);
  }
  if (options.dateTo) {
    parts.push(`publication-date<=${options.dateTo.replace(/-/g, "")}`);
  }

  return parts.join(" AND ");
}

export class TEDAwardConnector {
  meta = {
    name: "TED Awards",
    source: "ted_awards",
    description: "EU TED Contract Award Notices (CAN)",
  };

  async fetchAwards(options: FetchOptions): Promise<AwardFetchResult> {
    const limit = options.limit || 500;
    const q = buildAwardQuery(options);

    const allAwards: AwardRecord[] = [];
    let page = 1;
    const pageSize = Math.min(limit, 100);
    let totalAvailable = 0;

    while (allAwards.length < limit) {
      const body = {
        query: q,
        fields: AWARD_FIELDS,
        page,
        limit: pageSize,
        paginationMode: "PAGE_NUMBER",
        scope: "ALL", // Awards are for closed tenders
      };

      const response = await fetch(`${TED_API_BASE}/notices/search`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TED Award API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as TEDSearchResponse;
      totalAvailable = data.totalNoticeCount || 0;

      const notices = data.notices || [];
      if (notices.length === 0) break;

      for (const notice of notices) {
        const award = transformAwardNotice(notice);
        if (award) {
          allAwards.push(award);
        }
      }

      page++;

      // Respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return {
      awards: allAwards.slice(0, limit),
      totalAvailable,
    };
  }
}
