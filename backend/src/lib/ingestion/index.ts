/**
 * Ingestion Module - Barrel Export
 */

export { runIngestion, runAwardIngestion } from "./runner";
export type { IngestionRunOptions, IngestionRunResult } from "./runner";
export { TEDConnector } from "./ted-connector";
export { ANACConnector } from "./anac-connector";
export { TEDAwardConnector } from "./ted-award-connector";
export type { AwardRecord, AwardFetchResult } from "./ted-award-connector";
export { processAwards } from "./award-processor";
export type { AwardProcessResult } from "./award-processor";
export { deduplicateAndUpsert } from "./deduplicator";
export { generateNotificationsForNewTenders } from "./notification-generator";
export type {
  TenderConnector,
  RawTenderRecord,
  FetchOptions,
  FetchResult,
  ConnectorMeta,
} from "./connector";
