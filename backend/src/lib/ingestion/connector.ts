/**
 * Ingestion Connector Interface
 *
 * All tender sources (TED, ANAC, etc.) implement this interface.
 */

import type { TEDNotice } from "../types";

export interface RawTenderRecord {
  source: string;
  external_id: string;
  publication_number?: string;
  title: string;
  buyer?: string;
  description?: string;
  cpv_codes?: string[];
  country?: string;
  city?: string;
  value?: number;
  currency?: string;
  publication_date?: string;
  deadline?: string;
  procedure_type?: string;
  contract_nature?: string;
  is_framework_agreement?: boolean;
  sme_participation?: boolean;
  pdf_url?: string;
  raw_data?: Record<string, unknown>;
}

export interface FetchOptions {
  /** Free-text query */
  query?: string;
  /** Country filter (ISO 3166 alpha-3) */
  country?: string;
  /** CPV code filter */
  cpvCodes?: string[];
  /** Publication date from (YYYY-MM-DD) */
  dateFrom?: string;
  /** Publication date to (YYYY-MM-DD) */
  dateTo?: string;
  /** Max records to fetch */
  limit?: number;
}

export interface FetchResult {
  records: RawTenderRecord[];
  totalAvailable: number;
}

export interface ConnectorMeta {
  name: string;
  source: string;
  description: string;
}

export interface TenderConnector {
  meta: ConnectorMeta;
  fetch(options: FetchOptions): Promise<FetchResult>;
}
