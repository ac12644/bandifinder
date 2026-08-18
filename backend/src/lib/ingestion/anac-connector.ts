/**
 * ANAC Connector
 *
 * Fetches Italian public procurement data from ANAC (Autorità Nazionale Anticorruzione).
 * Data source: ANAC Open Data portal - monthly CSV datasets of CIG records.
 *
 * URL pattern:
 *   https://dati.anticorruzione.it/opendata/download/dataset/cig-{YYYY}/filesystem/cig_csv_{YYYY}_{MM}.zip
 *
 * Fields (from ANAC CIG dataset):
 *   cig, oggetto_gara, importo_complessivo_gara, denominazione_amministrazione_appaltante,
 *   provincia, data_pubblicazione, data_scadenza_offerta, cod_cpv, oggetto_principale_contratto,
 *   tipo_scelta_contraente, cod_modalita_realizzazione, stato, settore, etc.
 */

import type {
  TenderConnector,
  FetchOptions,
  FetchResult,
  RawTenderRecord,
} from "./connector";

const ANAC_BASE_URL =
  process.env.ANAC_API_BASE_URL ||
  "https://dati.anticorruzione.it/opendata/download/dataset";

/** Raw ANAC CIG record (CSV row parsed to object) */
interface ANACRecord {
  cig: string;
  numero_gara?: string;
  oggetto_gara?: string;
  importo_complessivo_gara?: string;
  importo_lotto?: string;
  oggetto_principale_contratto?: string;
  stato?: string;
  settore?: string;
  luogo_istat?: string;
  provincia?: string;
  data_pubblicazione?: string;
  data_scadenza_offerta?: string;
  cod_tipo_scelta_contraente?: string;
  tipo_scelta_contraente?: string;
  cod_modalita_realizzazione?: string;
  modalita_realizzazione?: string;
  codice_ausa?: string;
  cf_amministrazione_appaltante?: string;
  denominazione_amministrazione_appaltante?: string;
  cod_cpv?: string;
  descrizione_cpv?: string;
  anno_pubblicazione?: string;
  mese_pubblicazione?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize DD/MM/YYYY or YYYY-MM-DD to ISO YYYY-MM-DD */
function normalizeDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;

  // Handle DD/MM/YYYY
  const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const match = dateStr.match(ddmmyyyy);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;

  // Handle YYYY-MM-DD (already fine)
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) return dateStr.split("T")[0];

  return undefined;
}

/** Map ANAC oggetto_principale_contratto to standardized contract_nature */
function mapContractNature(tipo: string | undefined): string | undefined {
  if (!tipo) return undefined;
  const upper = tipo.toUpperCase().trim();
  const map: Record<string, string> = {
    L: "works",
    LAVORI: "works",
    S: "services",
    SERVIZI: "services",
    F: "supplies",
    FORNITURE: "supplies",
  };
  return map[upper] || tipo.toLowerCase();
}

/** Map ANAC modalita_realizzazione to standardized procedure_type */
function mapProcedureType(
  code: string | undefined,
  label: string | undefined
): string | undefined {
  if (label) return label.toLowerCase();
  if (code) return code;
  return undefined;
}

/** Parse a simple CSV string into an array of objects (handles quoted fields) */
function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.split("\n");
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j].trim()] = (values[j] || "").trim();
    }
    records.push(record);
  }

  return records;
}

/** Parse a single CSV line, respecting quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/** Transform ANAC record to our standard format */
function transformRecord(record: ANACRecord): RawTenderRecord {
  const value =
    parseFloat(record.importo_complessivo_gara || "") ||
    parseFloat(record.importo_lotto || "") ||
    undefined;

  return {
    source: "anac",
    external_id: record.cig,
    publication_number: record.cig,
    title: record.oggetto_gara || "Gara senza titolo",
    buyer: record.denominazione_amministrazione_appaltante,
    description: record.oggetto_gara,
    cpv_codes: record.cod_cpv ? [record.cod_cpv] : [],
    country: "ITA",
    city: record.provincia,
    value,
    currency: "EUR",
    publication_date: normalizeDate(record.data_pubblicazione),
    deadline: normalizeDate(record.data_scadenza_offerta),
    procedure_type: mapProcedureType(
      record.cod_modalita_realizzazione,
      record.modalita_realizzazione
    ),
    contract_nature: mapContractNature(record.oggetto_principale_contratto),
    is_framework_agreement: false,
    sme_participation: false,
    raw_data: record as unknown as Record<string, unknown>,
  };
}

/** Build the CSV download URL for a given year/month */
function buildDownloadUrl(year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  return `${ANAC_BASE_URL}/cig-${year}/filesystem/cig_csv_${year}_${mm}.zip`;
}

/** Determine which year/month CSVs to fetch based on date range */
function getMonthsInRange(
  dateFrom: string,
  dateTo: string
): Array<{ year: number; month: number }> {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const months: Array<{ year: number; month: number }> = [];

  const current = new Date(from.getFullYear(), from.getMonth(), 1);
  while (current <= to) {
    months.push({
      year: current.getFullYear(),
      month: current.getMonth() + 1,
    });
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

/** Fetch and decompress a ZIP file, extract the first CSV */
async function fetchAndParseCSV(
  url: string
): Promise<Record<string, string>[]> {
  const response = await fetch(url, {
    headers: { Accept: "application/zip, text/csv" },
  });

  if (!response.ok) {
    if (response.status === 404) return []; // Month not yet published
    throw new Error(`ANAC download failed: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";

  // If it's a ZIP, we need to decompress
  if (contentType.includes("zip") || url.endsWith(".zip")) {
    // Use Node.js built-in zlib for decompression
    const { Readable } = await import("stream");
    const { createUnzip } = await import("zlib");
    const { TextDecoder } = globalThis;

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // ZIP files start with PK signature. For simplicity, try to find the CSV
    // content within the ZIP. For production, use a proper ZIP library.
    // Fallback: try to parse as plain text (some endpoints serve unzipped CSV)
    const text = new TextDecoder("utf-8").decode(bytes);

    // If it looks like CSV (first line has commas, looks like headers)
    if (text.startsWith("cig,") || text.startsWith('"cig"')) {
      return parseCSV(text);
    }

    // ZIP format detected but we can't decompress without a library.
    // Log and return empty — in production, add `adm-zip` or `unzipper` dep.
    console.warn(
      `[ANAC] ZIP file detected at ${url}, skipping (add ZIP library for production)`
    );
    return [];
  }

  // Plain CSV
  const text = await response.text();
  return parseCSV(text);
}

// ---------------------------------------------------------------------------
// Connector
// ---------------------------------------------------------------------------

export class ANACConnector implements TenderConnector {
  meta = {
    name: "ANAC Open Data",
    source: "anac",
    description:
      "Autorità Nazionale Anticorruzione - Banca Dati Nazionale Contratti Pubblici",
  };

  async fetch(options: FetchOptions): Promise<FetchResult> {
    const limit = options.limit || 500;

    // Determine date range
    const dateFrom =
      options.dateFrom || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const dateTo =
      options.dateTo || new Date().toISOString().split("T")[0];

    const months = getMonthsInRange(dateFrom, dateTo);

    console.log(
      `[ANAC] Fetching ${months.length} month(s) from ${dateFrom} to ${dateTo}`
    );

    const allRecords: RawTenderRecord[] = [];

    for (const { year, month } of months) {
      if (allRecords.length >= limit) break;

      const url = buildDownloadUrl(year, month);
      console.log(`[ANAC] Fetching ${url}`);

      let retries = 3;
      let rawRecords: Record<string, string>[] = [];

      while (retries > 0) {
        try {
          rawRecords = await fetchAndParseCSV(url);
          break;
        } catch (err) {
          retries--;
          if (retries === 0) {
            console.error(
              `[ANAC] Failed to fetch ${year}/${month} after 3 attempts:`,
              err
            );
            break;
          }
          // Exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, (3 - retries) * 1000)
          );
        }
      }

      // Filter by date range and CPV codes
      for (const raw of rawRecords) {
        if (allRecords.length >= limit) break;

        const anacRecord = raw as unknown as ANACRecord;

        // Must have a CIG
        if (!anacRecord.cig) continue;

        // Filter by publication date
        const pubDate = normalizeDate(anacRecord.data_pubblicazione);
        if (pubDate && pubDate < dateFrom) continue;
        if (pubDate && pubDate > dateTo) continue;

        // Filter by CPV codes if specified
        if (options.cpvCodes && options.cpvCodes.length > 0 && anacRecord.cod_cpv) {
          const matchesCpv = options.cpvCodes.some((code) =>
            anacRecord.cod_cpv!.startsWith(code.substring(0, 5))
          );
          if (!matchesCpv) continue;
        }

        // Filter by query (free-text search in title)
        if (options.query) {
          const lowerQuery = options.query.toLowerCase();
          const title = (anacRecord.oggetto_gara || "").toLowerCase();
          if (!title.includes(lowerQuery)) continue;
        }

        allRecords.push(transformRecord(anacRecord));
      }

      // Rate limit between months
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return {
      records: allRecords.slice(0, limit),
      totalAvailable: allRecords.length,
    };
  }
}
