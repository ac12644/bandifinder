-- ============================================================================
-- Bandifinder: Bid Outcomes & Post-Mortem Intelligence
-- Phase 7: Learn from outcomes, system gets smarter
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE bid_outcome AS ENUM (
  'won',
  'lost',
  'withdrawn',
  'no_response'
);

-- ============================================================================
-- BID OUTCOMES
-- ============================================================================

CREATE TABLE bid_outcomes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bid_id UUID NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outcome bid_outcome NOT NULL,
  -- Competitive intelligence
  winning_bidder TEXT,
  winning_amount NUMERIC,
  num_bidders INTEGER,
  -- Learning
  reason TEXT,
  lessons_learned TEXT,
  -- Categorization (denormalized from bid/tender for fast analytics)
  tender_value NUMERIC,
  tender_buyer TEXT,
  tender_country TEXT,
  contract_nature TEXT,
  -- Timestamps
  outcome_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bid_id)
);

CREATE INDEX idx_bid_outcomes_org ON bid_outcomes(organization_id);
CREATE INDEX idx_bid_outcomes_outcome ON bid_outcomes(organization_id, outcome);
CREATE INDEX idx_bid_outcomes_date ON bid_outcomes(outcome_date) WHERE outcome_date IS NOT NULL;
CREATE INDEX idx_bid_outcomes_buyer ON bid_outcomes(winning_bidder) WHERE winning_bidder IS NOT NULL;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE bid_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on bid_outcomes"
  ON bid_outcomes FOR ALL
  USING (true)
  WITH CHECK (true);
