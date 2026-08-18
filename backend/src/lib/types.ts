/**
 * TED API Type Definitions
 *
 * Based on TED API v3 response schema.
 */

/**
 * Internationalized string field (common in TED API)
 */
export interface I18nString {
  ita?: string | string[];
  eng?: string | string[];
  [lang: string]: string | string[] | undefined;
}

/**
 * TED Notice from API response
 */
export interface TEDNotice {
  /** Unique publication number (e.g., "2024/S 001-000001") */
  "publication-number"?: string;

  /** Notice identifier (TED API v3 supported field) */
  "notice-identifier"?: string;

  /** Notice title (internationalized) */
  "notice-title"?: I18nString;

  /** Buyer/contracting authority name (internationalized) */
  "buyer-name"?: I18nString;

  /** Publication date (YYYY-MM-DD or array) */
  "publication-date"?: string | string[];

  /** Submission deadline for lot */
  "deadline-date-lot"?: string | string[];

  /** Alternative deadline field */
  "deadline-receipt-tender-date-lot"?: string | string[];

  /** Submission deadline (general) */
  "submission-deadline"?: string;

  /** CPV classification codes */
  "classification-cpv"?: string | string[];

  /** CPV codes (alternative field name) */
  "cpv-codes"?: string[];

  /** Global estimated value */
  "estimated-value-glo"?: number;

  /** Total contract value */
  "total-value"?: number;

  /** Links to documents */
  links?: {
    pdf?: I18nString;
    html?: I18nString;
    [key: string]: I18nString | undefined;
  };

  /** Procedure type */
  "procedure-type"?: string;

  /** Contract nature for main procedure */
  "contract-nature-main-proc"?: string;

  /** Contract nature for lot */
  "contract-nature-main-lot"?: string;

  /** Framework agreement indicator for lot */
  "framework-agreement-lot"?: boolean | string;

  /** Electronic auction indicator */
  "electronic-auction-lot"?: boolean | string;

  /** Subcontracting allowed */
  "subcontracting-allowed-lot"?: boolean | string;

  /** Place of performance */
  "place-of-performance"?: string | string[];

  /** Country of performance */
  "place-of-performance-country-proc"?: string;

  /** City of performance */
  "place-of-performance-city-proc"?: string;

  /** City of performance (lot level) */
  "place-of-performance-city-lot"?: string;

  /** Country of buyer (array in TED API v3) */
  "organisation-country-buyer"?: string | string[];

  /** Description (procedure level) */
  "description-proc"?: I18nString;

  /** Description (global) */
  "description-glo"?: I18nString;

  /** Description (lot level) */
  "description-lot"?: I18nString;

  /** SME participation indicator */
  "sme-part"?: boolean | string;

  /** Allow additional fields */
  [key: string]: unknown;
}

/**
 * TED API Search Response
 */
export interface TEDSearchResponse {
  /** Array of notices */
  notices?: TEDNotice[];

  /** Total number of matching notices */
  totalNoticeCount?: number;

  /** Token for next page iteration */
  iterationNextToken?: string | null;

  /** Whether the query timed out */
  timedOut?: boolean;

  /** API errors */
  errors?: unknown;

  /** Parse error if response was malformed */
  parseError?: string;

  /** Raw response text on parse error */
  raw?: string;
}

/**
 * Transformed tender for our application
 */
export interface Tender {
  id: string;
  publicationNumber: string;
  noticeId?: string;
  title: string;
  buyer: string;
  description?: string;
  cpv?: string;
  cpvCodes?: string[];
  country?: string;
  city?: string;
  value?: number;
  valueFormatted?: string;
  publicationDate?: string;
  deadline?: string;
  procedureType?: string;
  contractNature?: string;
  isFrameworkAgreement?: boolean;
  smeParticipation?: boolean;
  pdfUrl?: string;
  score?: number;
}

/**
 * Transform TED notice to our Tender format
 */
export function transformTEDNotice(notice: TEDNotice): Tender {
  // Get title (prefer Italian, fallback to English)
  const titleField = notice["notice-title"];
  let title = "Untitled";
  if (titleField) {
    if (Array.isArray(titleField.ita)) {
      title = titleField.ita[0] || title;
    } else if (typeof titleField.ita === "string") {
      title = titleField.ita;
    } else if (Array.isArray(titleField.eng)) {
      title = titleField.eng[0] || title;
    } else if (typeof titleField.eng === "string") {
      title = titleField.eng;
    }
  }

  // Get buyer
  const buyerField = notice["buyer-name"];
  let buyer = "Unknown";
  if (buyerField) {
    if (Array.isArray(buyerField.ita)) {
      buyer = buyerField.ita[0] || buyer;
    } else if (typeof buyerField.ita === "string") {
      buyer = buyerField.ita;
    } else if (Array.isArray(buyerField.eng)) {
      buyer = buyerField.eng[0] || buyer;
    } else if (typeof buyerField.eng === "string") {
      buyer = buyerField.eng;
    }
  }

  // Get CPV codes
  const cpvCodes = notice["cpv-codes"] ||
    (Array.isArray(notice["classification-cpv"])
      ? notice["classification-cpv"]
      : notice["classification-cpv"]
      ? [notice["classification-cpv"]]
      : []);

  // Get value
  const value = notice["estimated-value-glo"] || notice["total-value"];

  // Get deadline
  const deadline =
    notice["submission-deadline"] ||
    (Array.isArray(notice["deadline-date-lot"])
      ? notice["deadline-date-lot"][0]
      : notice["deadline-date-lot"]) ||
    (Array.isArray(notice["deadline-receipt-tender-date-lot"])
      ? notice["deadline-receipt-tender-date-lot"][0]
      : notice["deadline-receipt-tender-date-lot"]);

  // Get publication date
  const pubDate = Array.isArray(notice["publication-date"])
    ? notice["publication-date"][0]
    : notice["publication-date"];

  // Get PDF URL
  const pdfLinks = notice.links?.pdf;
  let pdfUrl: string | undefined;
  if (pdfLinks) {
    if (typeof pdfLinks.ita === "string") {
      pdfUrl = pdfLinks.ita;
    } else if (Array.isArray(pdfLinks.ita)) {
      pdfUrl = pdfLinks.ita[0];
    } else if (typeof pdfLinks.eng === "string") {
      pdfUrl = pdfLinks.eng;
    } else if (Array.isArray(pdfLinks.eng)) {
      pdfUrl = pdfLinks.eng[0];
    }
  }

  // Get description (prefer lot, then proc, then global)
  let description = title.substring(0, 200);
  const descLot = notice["description-lot"];
  const descProc = notice["description-proc"];
  const descGlo = notice["description-glo"];
  if (descLot) {
    if (Array.isArray(descLot.ita)) description = descLot.ita[0] || description;
    else if (typeof descLot.ita === "string") description = descLot.ita;
    else if (Array.isArray(descLot.eng)) description = descLot.eng[0] || description;
    else if (typeof descLot.eng === "string") description = descLot.eng;
  } else if (descProc) {
    if (Array.isArray(descProc.ita)) description = descProc.ita[0] || description;
    else if (typeof descProc.ita === "string") description = descProc.ita;
    else if (Array.isArray(descProc.eng)) description = descProc.eng[0] || description;
    else if (typeof descProc.eng === "string") description = descProc.eng;
  } else if (descGlo) {
    if (Array.isArray(descGlo.ita)) description = descGlo.ita[0] || description;
    else if (typeof descGlo.ita === "string") description = descGlo.ita;
    else if (Array.isArray(descGlo.eng)) description = descGlo.eng[0] || description;
    else if (typeof descGlo.eng === "string") description = descGlo.eng;
  }

  // Get country (handle array format from API)
  const countryBuyer = notice["organisation-country-buyer"];
  const country = Array.isArray(countryBuyer) ? countryBuyer[0] : countryBuyer || notice["place-of-performance-country-proc"];

  return {
    id: notice["notice-identifier"] || notice["publication-number"] || crypto.randomUUID(),
    publicationNumber: notice["publication-number"] || "",
    noticeId: notice["notice-identifier"],
    title,
    buyer,
    description: description.substring(0, 500),
    cpv: cpvCodes[0],
    cpvCodes: cpvCodes as string[],
    country,
    city: notice["place-of-performance-city-proc"] || notice["place-of-performance-city-lot"],
    value: typeof value === "number" ? value : undefined,
    valueFormatted: typeof value === "number" ? formatValue(value) : undefined,
    publicationDate: pubDate,
    deadline,
    procedureType: notice["procedure-type"],
    contractNature: notice["contract-nature-main-proc"] || notice["contract-nature-main-lot"],
    isFrameworkAgreement: !!notice["framework-agreement-lot"],
    smeParticipation: !!notice["sme-part"],
    pdfUrl,
  };
}

/**
 * Format currency value
 */
function formatValue(value: number): string {
  return `€ ${value.toLocaleString("it-IT")}`;
}
