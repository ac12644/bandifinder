/**
 * TED API Connector
 *
 * Fetches tenders from the EU TED API v3 and transforms them
 * into the standard RawTenderRecord format.
 */

import type { TEDNotice, TEDSearchResponse, I18nString } from "../types";
import type { TenderConnector, FetchOptions, FetchResult, RawTenderRecord } from "./connector";

const TED_API_BASE = "https://api.ted.europa.eu/v3";

const DEFAULT_FIELDS = [
  "publication-number",
  "notice-identifier",
  "notice-title",
  "buyer-name",
  "publication-date",
  "deadline-date-lot",
  "deadline-receipt-tender-date-lot",
  "classification-cpv",
  "estimated-value-glo",
  "total-value",
  "organisation-country-buyer",
  "place-of-performance-country-proc",
  "place-of-performance-city-proc",
  "place-of-performance-city-lot",
  "description-lot",
  "description-proc",
  "description-glo",
  "procedure-type",
  "contract-nature-main-proc",
  "contract-nature-main-lot",
  "framework-agreement-lot",
  "sme-part",
];

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

/** Transform a TED notice into our standard format */
function transformNotice(notice: TEDNotice): RawTenderRecord {
  const title = extractI18n(notice["notice-title"], "Untitled");
  const buyer = extractI18n(notice["buyer-name"], "Unknown");

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

  // City
  const city =
    notice["place-of-performance-city-proc"] ||
    notice["place-of-performance-city-lot"];

  // Deadline
  const deadline =
    (Array.isArray(notice["deadline-date-lot"])
      ? notice["deadline-date-lot"][0]
      : notice["deadline-date-lot"]) ||
    (Array.isArray(notice["deadline-receipt-tender-date-lot"])
      ? notice["deadline-receipt-tender-date-lot"][0]
      : notice["deadline-receipt-tender-date-lot"]);

  // Description (prefer lot > proc > global)
  let description = title.substring(0, 200);
  const descLot = notice["description-lot"];
  const descProc = notice["description-proc"];
  const descGlo = notice["description-glo"];
  if (descLot) {
    description = extractI18n(descLot, description);
  } else if (descProc) {
    description = extractI18n(descProc, description);
  } else if (descGlo) {
    description = extractI18n(descGlo, description);
  }

  // Value
  const value = notice["estimated-value-glo"] || notice["total-value"];

  // External ID
  const externalId =
    notice["notice-identifier"] ||
    notice["publication-number"] ||
    crypto.randomUUID();

  return {
    source: "ted",
    external_id: externalId,
    publication_number: notice["publication-number"],
    title,
    buyer,
    description: description.substring(0, 2000),
    cpv_codes: cpvCodes as string[],
    country: country as string | undefined,
    city: typeof city === "string" ? city : undefined,
    value: typeof value === "number" ? value : undefined,
    currency: "EUR",
    publication_date: pubDate as string | undefined,
    deadline: deadline as string | undefined,
    procedure_type: notice["procedure-type"],
    contract_nature:
      notice["contract-nature-main-proc"] ||
      notice["contract-nature-main-lot"],
    is_framework_agreement: !!notice["framework-agreement-lot"],
    sme_participation: !!notice["sme-part"],
    raw_data: notice as unknown as Record<string, unknown>,
  };
}

/** Build TED expert query from options */
function buildQuery(options: FetchOptions): string {
  const parts: string[] = [];

  if (options.query) {
    parts.push(`FT~"${options.query}"`);
  }
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

  return parts.length > 0
    ? parts.join(" AND ")
    : `publication-date>=today(-30)`;
}

export class TEDConnector implements TenderConnector {
  meta = {
    name: "TED API",
    source: "ted",
    description: "EU Tenders Electronic Daily (TED) API v3",
  };

  async fetch(options: FetchOptions): Promise<FetchResult> {
    const limit = options.limit || 500;
    const q = buildQuery(options);

    const allRecords: RawTenderRecord[] = [];
    let page = 1;
    const pageSize = Math.min(limit, 100);
    let totalAvailable = 0;

    while (allRecords.length < limit) {
      const body = {
        query: q,
        fields: DEFAULT_FIELDS,
        page,
        limit: pageSize,
        paginationMode: "PAGE_NUMBER",
        scope: "ACTIVE",
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
        throw new Error(`TED API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as TEDSearchResponse;
      totalAvailable = data.totalNoticeCount || 0;

      const notices = data.notices || [];
      if (notices.length === 0) break;

      allRecords.push(...notices.map(transformNotice));
      page++;

      // Respect rate limits (200ms between requests)
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return {
      records: allRecords.slice(0, limit),
      totalAvailable,
    };
  }
}
