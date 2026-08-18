/**
 * Graph Checkpointer
 *
 * LangGraph stores conversation state as checkpoints keyed by thread id. The
 * supervisor was compiled with `MemorySaver`, which keeps those checkpoints in
 * the process heap — on serverless that means a thread survives only as long
 * as the instance that created it. Conversations vanished on cold start, and
 * anything needing a durable thread (resuming, time travel) could not work at
 * all. The docs are explicit that MemorySaver is for prototyping and that
 * production should use a persistent saver.
 *
 * This resolves a Postgres saver from DATABASE_URL, falling back to the
 * in-memory one with a loud warning when that is not configured, so local
 * development and tests keep working without a database.
 */

import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { logger } from "./observability";

/**
 * Checkpoint tables live in their own schema rather than `public`, so
 * LangGraph's bookkeeping stays separate from the application's own tables and
 * from the Supabase migrations in supabase/migrations.
 */
const CHECKPOINT_SCHEMA = "langgraph";

/**
 * Resolved once per process. `setup()` creates the checkpoint tables on first
 * use and is idempotent, but it is still a round trip, so it must not run per
 * request.
 */
let resolved: Promise<BaseCheckpointSaver> | null = null;

async function createCheckpointer(): Promise<BaseCheckpointSaver> {
  const connectionString =
    process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!connectionString) {
    logger.warn(
      "No DATABASE_URL set — using in-memory checkpointer. Conversation " +
        "threads will not survive a restart. Set DATABASE_URL to a Postgres " +
        "connection string for durable memory.",
    );
    return new MemorySaver();
  }

  try {
    const saver = PostgresSaver.fromConnString(connectionString, {
      schema: CHECKPOINT_SCHEMA,
    });

    // Creates the checkpoint tables if they do not exist. Idempotent.
    await saver.setup();

    logger.info("Postgres checkpointer ready", { schema: CHECKPOINT_SCHEMA });
    return saver;
  } catch (error) {
    // A checkpointer that cannot reach its database must not take the whole
    // agent down: degrade to per-instance memory and make the loss obvious.
    logger.error(
      "Postgres checkpointer unavailable, falling back to in-memory",
      error as Error,
    );
    return new MemorySaver();
  }
}

/**
 * The process-wide checkpointer, created on first call.
 */
export function getCheckpointer(): Promise<BaseCheckpointSaver> {
  if (!resolved) resolved = createCheckpointer();
  return resolved;
}

/** Reset between tests. */
export function __resetCheckpointer(): void {
  resolved = null;
}
