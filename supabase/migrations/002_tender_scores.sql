-- ============================================================================
-- Tender Scores: Cached per-org scoring breakdown
-- ============================================================================

CREATE TABLE tender_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  overall_score NUMERIC NOT NULL DEFAULT 0,
  recommendation TEXT NOT NULL DEFAULT 'REVIEW' CHECK (recommendation IN ('BID', 'REVIEW', 'SKIP')),
  components JSONB NOT NULL DEFAULT '[]',
  eligibility JSONB NOT NULL DEFAULT '[]',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tender_id, organization_id)
);

CREATE INDEX idx_tender_scores_tender ON tender_scores(tender_id);
CREATE INDEX idx_tender_scores_org ON tender_scores(organization_id);
CREATE INDEX idx_tender_scores_overall ON tender_scores(overall_score DESC);

ALTER TABLE tender_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view tender scores" ON tender_scores
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );
