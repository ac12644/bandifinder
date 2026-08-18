-- 006_usage_limits.sql
-- Durable, shared usage accounting for plan quotas and rate limiting.
--
-- Both previously lived in module-level Maps inside the API process. On
-- serverless that means per-instance state: daily search quotas reset on every
-- cold start, and rate limits multiplied by the number of running instances
-- (scaling up under load *raised* the ceiling). This moves both into Postgres
-- so the counters are shared and survive instance recycling.

-- ---------------------------------------------------------------------------
-- Daily plan quotas (searches/day, etc.)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usage_counters (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric          TEXT NOT NULL,
  day             DATE NOT NULL DEFAULT CURRENT_DATE,
  count           INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, metric, day)
);

-- Supports the nightly/periodic purge of old rows.
CREATE INDEX IF NOT EXISTS idx_usage_counters_day ON usage_counters(day);

COMMENT ON TABLE usage_counters IS
  'Per-organization daily usage counters backing plan quota enforcement.';

-- ---------------------------------------------------------------------------
-- Atomic quota consumption
-- ---------------------------------------------------------------------------
--
-- Increments the counter and reports whether the caller is within the limit,
-- in a single statement. The previous implementation read the count and then
-- incremented it in separate steps, so concurrent requests could both observe
-- "under the limit" and both proceed, overshooting the quota.

CREATE OR REPLACE FUNCTION consume_daily_quota(
  p_organization_id UUID,
  p_metric          TEXT,
  p_limit           INTEGER
)
RETURNS TABLE (allowed BOOLEAN, used INTEGER)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- A negative limit means unlimited: count usage but never block.
  IF p_limit < 0 THEN
    INSERT INTO usage_counters AS u (organization_id, metric, day, count)
    VALUES (p_organization_id, p_metric, CURRENT_DATE, 1)
    ON CONFLICT (organization_id, metric, day)
    DO UPDATE SET count = u.count + 1, updated_at = NOW()
    RETURNING u.count INTO v_count;

    RETURN QUERY SELECT TRUE, v_count;
    RETURN;
  END IF;

  -- A zero limit blocks outright. The WHERE below only guards the conflict
  -- path, so without this a fresh row would insert count=1 and let the first
  -- request of the day through on a plan that allows none.
  IF p_limit = 0 THEN
    RETURN QUERY SELECT FALSE, COALESCE(
      (SELECT u.count FROM usage_counters u
        WHERE u.organization_id = p_organization_id
          AND u.metric = p_metric
          AND u.day = CURRENT_DATE),
      0
    );
    RETURN;
  END IF;

  -- The WHERE clause makes the update a no-op once the limit is reached, so
  -- the RETURNING yields no row and v_count stays NULL.
  INSERT INTO usage_counters AS u (organization_id, metric, day, count)
  VALUES (p_organization_id, p_metric, CURRENT_DATE, 1)
  ON CONFLICT (organization_id, metric, day)
  DO UPDATE SET count = u.count + 1, updated_at = NOW()
  WHERE u.count < p_limit
  RETURNING u.count INTO v_count;

  IF v_count IS NULL THEN
    SELECT u.count INTO v_count
      FROM usage_counters u
     WHERE u.organization_id = p_organization_id
       AND u.metric = p_metric
       AND u.day = CURRENT_DATE;

    RETURN QUERY SELECT FALSE, COALESCE(v_count, 0);
  ELSE
    RETURN QUERY SELECT TRUE, v_count;
  END IF;
END;
$$;

COMMENT ON FUNCTION consume_daily_quota IS
  'Atomically increment a daily usage counter, reporting whether the caller is within the plan limit.';

-- Read current usage without consuming, for surfacing remaining quota in the UI.
CREATE OR REPLACE FUNCTION peek_daily_quota(
  p_organization_id UUID,
  p_metric          TEXT
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT count FROM usage_counters
      WHERE organization_id = p_organization_id
        AND metric = p_metric
        AND day = CURRENT_DATE),
    0
  );
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting (token bucket)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key  TEXT PRIMARY KEY,
  tokens      DOUBLE PRECISION NOT NULL,
  last_refill TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_last_refill
  ON rate_limit_buckets(last_refill);

COMMENT ON TABLE rate_limit_buckets IS
  'Shared token buckets so rate limits apply across all API instances.';

-- Refill by elapsed time, then consume one token if available. Single
-- statement so concurrent requests on different instances cannot both spend
-- the last token.
CREATE OR REPLACE FUNCTION consume_rate_limit_token(
  p_bucket_key     TEXT,
  p_limit          INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining DOUBLE PRECISION, retry_after INTEGER)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tokens      DOUBLE PRECISION;
  v_refill_rate DOUBLE PRECISION := p_limit::DOUBLE PRECISION / p_window_seconds;
BEGIN
  -- Same reasoning as consume_daily_quota: the conflict guard does not cover
  -- the first insert, so a zero limit is rejected up front.
  IF p_limit <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::DOUBLE PRECISION, p_window_seconds;
    RETURN;
  END IF;

  INSERT INTO rate_limit_buckets AS b (bucket_key, tokens, last_refill)
  VALUES (p_bucket_key, p_limit - 1, NOW())
  ON CONFLICT (bucket_key) DO UPDATE
    SET tokens = LEAST(
          p_limit::DOUBLE PRECISION,
          b.tokens + EXTRACT(EPOCH FROM (NOW() - b.last_refill)) * v_refill_rate
        ) - 1,
        last_refill = NOW()
    WHERE LEAST(
            p_limit::DOUBLE PRECISION,
            b.tokens + EXTRACT(EPOCH FROM (NOW() - b.last_refill)) * v_refill_rate
          ) >= 1
  RETURNING b.tokens INTO v_tokens;

  IF v_tokens IS NULL THEN
    -- Bucket empty. Report how long until one token is available again.
    SELECT LEAST(
             p_limit::DOUBLE PRECISION,
             b.tokens + EXTRACT(EPOCH FROM (NOW() - b.last_refill)) * v_refill_rate
           )
      INTO v_tokens
      FROM rate_limit_buckets b
     WHERE b.bucket_key = p_bucket_key;

    RETURN QUERY SELECT
      FALSE,
      GREATEST(COALESCE(v_tokens, 0), 0),
      GREATEST(CEIL((1 - COALESCE(v_tokens, 0)) / v_refill_rate)::INTEGER, 1);
  ELSE
    RETURN QUERY SELECT TRUE, GREATEST(v_tokens, 0), 0;
  END IF;
END;
$$;

COMMENT ON FUNCTION consume_rate_limit_token IS
  'Atomically refill and consume one token from a shared rate limit bucket.';

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------
--
-- Both tables grow with traffic. Neither is read outside its own window, so
-- old rows can be dropped. Schedule via pg_cron alongside the ingestion job:
--   SELECT cron.schedule('purge-usage', '17 3 * * *', 'SELECT purge_usage_data()');

CREATE OR REPLACE FUNCTION purge_usage_data()
RETURNS void
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  DELETE FROM usage_counters WHERE day < CURRENT_DATE - INTERVAL '90 days';
  DELETE FROM rate_limit_buckets WHERE last_refill < NOW() - INTERVAL '1 day';
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Written only by the API using the service_role key, which bypasses RLS.
-- Enabled with no permissive policy so nothing else can read or write them.

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
