/**
 * Graph checkpointer
 *
 * The supervisor compiled with MemorySaver, which keeps conversation threads
 * in the process heap. On serverless that meant a thread lived only as long as
 * the instance that created it, so conversation memory silently disappeared on
 * cold start. The docs reserve MemorySaver for prototyping and direct
 * production at a persistent saver.
 *
 * A `setSupervisorCheckpointer` setter used to exist but could never work: the
 * graph compiled at module load and captured the saver before anyone could
 * call it. Compilation is now deferred until the checkpointer resolves.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemorySaver } from "@langchain/langgraph";

const setup = vi.fn();
const fromConnString = vi.fn();

vi.mock("@langchain/langgraph-checkpoint-postgres", () => ({
  PostgresSaver: {
    fromConnString: (...a: unknown[]) => fromConnString(...a),
  },
}));

const { getCheckpointer, __resetCheckpointer } = await import(
  "../../lib/checkpointer"
);

const ORIGINAL_DB_URL = process.env.DATABASE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  __resetCheckpointer();
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  setup.mockResolvedValue(undefined);
  fromConnString.mockReturnValue({ setup, __kind: "postgres" });
});

afterEach(() => {
  if (ORIGINAL_DB_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DB_URL;
  __resetCheckpointer();
});

describe("resolution", () => {
  it("uses Postgres when a connection string is configured", async () => {
    process.env.DATABASE_URL = "postgresql://user:pw@host:5432/db";

    const cp = (await getCheckpointer()) as unknown as { __kind?: string };

    expect(cp.__kind).toBe("postgres");
    expect(fromConnString).toHaveBeenCalledWith(
      "postgresql://user:pw@host:5432/db",
      { schema: "langgraph" }
    );
  });

  it("creates its tables exactly once, not per request", async () => {
    process.env.DATABASE_URL = "postgresql://user:pw@host:5432/db";

    await getCheckpointer();
    await getCheckpointer();
    await getCheckpointer();

    // setup() is a round trip; resolving once per process is the point.
    expect(setup).toHaveBeenCalledOnce();
  });

  it("keeps checkpoint tables out of the public schema", async () => {
    process.env.DATABASE_URL = "postgresql://user:pw@host:5432/db";
    await getCheckpointer();

    const [, options] = fromConnString.mock.calls[0] as [string, { schema: string }];
    expect(options.schema).toBe("langgraph");
    expect(options.schema).not.toBe("public");
  });

  it("accepts POSTGRES_URL as an alternative", async () => {
    process.env.POSTGRES_URL = "postgresql://user:pw@host:5432/other";

    await getCheckpointer();

    expect(fromConnString).toHaveBeenCalledWith(
      "postgresql://user:pw@host:5432/other",
      expect.anything()
    );
  });
});

describe("degradation", () => {
  it("falls back to memory when no database is configured", async () => {
    const cp = await getCheckpointer();

    // Local dev and tests must keep working without a database.
    expect(cp).toBeInstanceOf(MemorySaver);
    expect(fromConnString).not.toHaveBeenCalled();
  });

  it("falls back to memory when Postgres is unreachable", async () => {
    process.env.DATABASE_URL = "postgresql://user:pw@unreachable:5432/db";
    setup.mockRejectedValue(new Error("connection refused"));

    const cp = await getCheckpointer();

    // A checkpointer that cannot reach its database must not take the agent
    // down with it.
    expect(cp).toBeInstanceOf(MemorySaver);
  });

  it("does not retry a failed connection on every call", async () => {
    process.env.DATABASE_URL = "postgresql://user:pw@unreachable:5432/db";
    setup.mockRejectedValue(new Error("connection refused"));

    await getCheckpointer();
    await getCheckpointer();

    expect(fromConnString).toHaveBeenCalledOnce();
  });
});
