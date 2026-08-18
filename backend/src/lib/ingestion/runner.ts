/**
 * Ingestion Runner
 *
 * Orchestrates a full ingestion cycle:
 * 1. Create ingestion job record
 * 2. Fetch from connector (TED API)
 * 3. Deduplicate & detect amendments
 * 4. Upsert to Pinecone for vector search
 * 5. Generate notifications for matching saved searches
 * 6. Update job record with results
 */

import {
  createIngestionJob,
  updateIngestionJob,
  getLatestCompletedJob,
} from "../db/ingestion-jobs";
import { pineconeService } from "../pinecone";
import type { TenderDocument } from "../pinecone";
import { TEDConnector } from "./ted-connector";
import { TEDAwardConnector } from "./ted-award-connector";
import { processAwards } from "./award-processor";
import { deduplicateAndUpsert } from "./deduplicator";
import { generateNotificationsForNewTenders } from "./notification-generator";
import type { TenderConnector, FetchOptions, RawTenderRecord } from "./connector";

export interface IngestionRunOptions {
  /** Override connector (default: TED) */
  connector?: TenderConnector;
  /** Fetch options passed to connector */
  fetchOptions?: FetchOptions;
  /** Skip Pinecone vector upsert */
  skipVectors?: boolean;
  /** Skip notification generation */
  skipNotifications?: boolean;
}

export interface IngestionRunResult {
  jobId: string;
  tendersFound: number;
  tendersNew: number;
  tendersUpdated: number;
  amendmentsDetected: number;
  notificationsCreated: number;
  vectorsUpserted: number;
  durationMs: number;
}

export async function runIngestion(
  options: IngestionRunOptions = {}
): Promise<IngestionRunResult> {
  const startTime = Date.now();
  const connector = options.connector || new TEDConnector();

  // Create job record
  const job = await createIngestionJob({
    source: connector.meta.source,
    metadata: {
      fetchOptions: options.fetchOptions || {},
      connector: connector.meta.name,
    },
  });

  try {
    // Mark running
    await updateIngestionJob(job.id, {
      status: "running",
      started_at: new Date().toISOString(),
    });

    // Determine date range: from last completed job or default 30 days
    const fetchOptions = options.fetchOptions || {};
    if (!fetchOptions.dateFrom) {
      const lastJob = await getLatestCompletedJob(connector.meta.source);
      if (lastJob?.completed_at) {
        // Fetch from last completed job, with 1 day overlap for safety
        const lastDate = new Date(lastJob.completed_at);
        lastDate.setDate(lastDate.getDate() - 1);
        fetchOptions.dateFrom = lastDate.toISOString().split("T")[0];
      } else {
        // First run: last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        fetchOptions.dateFrom = thirtyDaysAgo.toISOString().split("T")[0];
      }
    }
    if (!fetchOptions.dateTo) {
      fetchOptions.dateTo = new Date().toISOString().split("T")[0];
    }

    console.log(
      `[Ingestion] Fetching from ${connector.meta.name} (${fetchOptions.dateFrom} to ${fetchOptions.dateTo})...`
    );

    // Step 1: Fetch from source
    const fetchResult = await connector.fetch(fetchOptions);
    const records = fetchResult.records;
    console.log(
      `[Ingestion] Fetched ${records.length} records (${fetchResult.totalAvailable} total available)`
    );

    if (records.length === 0) {
      await updateIngestionJob(job.id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        tenders_found: 0,
        tenders_new: 0,
        tenders_updated: 0,
        amendments_detected: 0,
      });
      return {
        jobId: job.id,
        tendersFound: 0,
        tendersNew: 0,
        tendersUpdated: 0,
        amendmentsDetected: 0,
        notificationsCreated: 0,
        vectorsUpserted: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 2: Deduplicate, detect amendments, upsert to Supabase
    console.log(`[Ingestion] Deduplicating and upserting ${records.length} tenders...`);
    const dedupResult = await deduplicateAndUpsert(records, job.id);

    // Step 3: Upsert new tenders to Pinecone for vector search
    let vectorsUpserted = 0;
    if (!options.skipVectors && dedupResult.tendersNew > 0) {
      const newRecords = records.filter(
        (r) => !dedupResult.tenderIdMap.has(r.external_id) || dedupResult.tendersNew > 0
      );
      const tenderDocs = records.map(recordToTenderDocument);

      try {
        console.log(
          `[Ingestion] Upserting ${tenderDocs.length} vectors to Pinecone...`
        );
        const pineconeResult = await pineconeService.upsertTenders(tenderDocs);
        vectorsUpserted = pineconeResult.success;
      } catch (err) {
        console.error("[Ingestion] Pinecone upsert failed (non-fatal):", err);
      }
    }

    // Step 4: Generate notifications for new tenders
    let notificationsCreated = 0;
    if (!options.skipNotifications && dedupResult.tendersNew > 0) {
      const newRecords = records.filter(
        (r) => {
          const dbId = dedupResult.tenderIdMap.get(r.external_id);
          return dbId !== undefined;
        }
      );

      try {
        console.log(`[Ingestion] Generating notifications for ${newRecords.length} new tenders...`);
        notificationsCreated = await generateNotificationsForNewTenders(
          newRecords,
          dedupResult.tenderIdMap
        );
      } catch (err) {
        console.error("[Ingestion] Notification generation failed (non-fatal):", err);
      }
    }

    // Step 5: Update job record
    await updateIngestionJob(job.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      tenders_found: records.length,
      tenders_new: dedupResult.tendersNew,
      tenders_updated: dedupResult.tendersUpdated,
      amendments_detected: dedupResult.amendmentsDetected,
      metadata: {
        fetchOptions,
        connector: connector.meta.name,
        vectorsUpserted,
        notificationsCreated,
      },
    });

    const result: IngestionRunResult = {
      jobId: job.id,
      tendersFound: records.length,
      tendersNew: dedupResult.tendersNew,
      tendersUpdated: dedupResult.tendersUpdated,
      amendmentsDetected: dedupResult.amendmentsDetected,
      notificationsCreated,
      vectorsUpserted,
      durationMs: Date.now() - startTime,
    };

    console.log("[Ingestion] Complete:", result);
    return result;
  } catch (error) {
    // Mark job as failed
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[Ingestion] Failed:", errMsg);

    await updateIngestionJob(job.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      error: errMsg,
    });

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Award Ingestion
// ---------------------------------------------------------------------------

export interface AwardIngestionResult {
  jobId: string;
  awardsFound: number;
  tendersUpdated: number;
  tendersNotFound: number;
  durationMs: number;
}

/**
 * Run award ingestion: fetch Contract Award Notices from TED and link to existing tenders.
 */
export async function runAwardIngestion(
  options: { fetchOptions?: FetchOptions } = {}
): Promise<AwardIngestionResult> {
  const startTime = Date.now();
  const connector = new TEDAwardConnector();

  const job = await createIngestionJob({
    source: connector.meta.source,
    metadata: {
      fetchOptions: options.fetchOptions || {},
      connector: connector.meta.name,
    },
  });

  try {
    await updateIngestionJob(job.id, {
      status: "running",
      started_at: new Date().toISOString(),
    });

    // Determine date range
    const fetchOptions = options.fetchOptions || {};
    if (!fetchOptions.dateFrom) {
      const lastJob = await getLatestCompletedJob(connector.meta.source);
      if (lastJob?.completed_at) {
        const lastDate = new Date(lastJob.completed_at);
        lastDate.setDate(lastDate.getDate() - 1);
        fetchOptions.dateFrom = lastDate.toISOString().split("T")[0];
      } else {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        fetchOptions.dateFrom = thirtyDaysAgo.toISOString().split("T")[0];
      }
    }
    if (!fetchOptions.dateTo) {
      fetchOptions.dateTo = new Date().toISOString().split("T")[0];
    }

    console.log(
      `[AwardIngestion] Fetching awards from ${fetchOptions.dateFrom} to ${fetchOptions.dateTo}...`
    );

    // Step 1: Fetch award notices
    const fetchResult = await connector.fetchAwards(fetchOptions);
    console.log(
      `[AwardIngestion] Fetched ${fetchResult.awards.length} awards (${fetchResult.totalAvailable} total available)`
    );

    if (fetchResult.awards.length === 0) {
      await updateIngestionJob(job.id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        tenders_found: 0,
        tenders_new: 0,
        tenders_updated: 0,
        amendments_detected: 0,
      });
      return {
        jobId: job.id,
        awardsFound: 0,
        tendersUpdated: 0,
        tendersNotFound: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 2: Process awards — match to tenders and update
    const processResult = await processAwards(fetchResult.awards);

    // Step 3: Update job record
    await updateIngestionJob(job.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      tenders_found: fetchResult.awards.length,
      tenders_new: 0,
      tenders_updated: processResult.tendersUpdated,
      amendments_detected: 0,
      metadata: {
        fetchOptions,
        connector: connector.meta.name,
        tendersNotFound: processResult.tendersNotFound,
      },
    });

    const result: AwardIngestionResult = {
      jobId: job.id,
      awardsFound: fetchResult.awards.length,
      tendersUpdated: processResult.tendersUpdated,
      tendersNotFound: processResult.tendersNotFound,
      durationMs: Date.now() - startTime,
    };

    console.log("[AwardIngestion] Complete:", result);
    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[AwardIngestion] Failed:", errMsg);

    await updateIngestionJob(job.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      error: errMsg,
    });

    throw error;
  }
}

/** Convert a RawTenderRecord to a PineconeService TenderDocument */
function recordToTenderDocument(record: RawTenderRecord): TenderDocument {
  return {
    id: record.external_id,
    title: record.title,
    description: record.description || record.title.substring(0, 200),
    category: record.cpv_codes?.[0],
    country: record.country,
    value: record.value,
    currency: record.currency || "EUR",
    deadline: record.deadline,
    publishedDate: record.publication_date,
    contractingAuthority: record.buyer,
    cpvCodes: record.cpv_codes,
  };
}
