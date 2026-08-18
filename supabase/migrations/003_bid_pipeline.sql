-- ============================================================================
-- Bandifinder: Bid Pipeline Tables
-- Phase 5: Team Workspace & Bid Management
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE bid_status AS ENUM (
  'new',
  'reviewing',
  'preparing',
  'submitted',
  'won',
  'lost'
);

CREATE TYPE bid_role AS ENUM (
  'lead',
  'contributor',
  'reviewer'
);

-- ============================================================================
-- BIDS
-- ============================================================================

CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tender_id UUID REFERENCES tenders(id) ON DELETE SET NULL,
  external_tender_id TEXT,
  tender_title TEXT NOT NULL,
  tender_buyer TEXT,
  tender_value NUMERIC,
  tender_deadline DATE,
  status bid_status NOT NULL DEFAULT 'new',
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ,
  outcome_at TIMESTAMPTZ,
  outcome_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bids_org ON bids(organization_id);
CREATE INDEX idx_bids_status ON bids(organization_id, status);
CREATE INDEX idx_bids_tender ON bids(tender_id);
CREATE INDEX idx_bids_deadline ON bids(tender_deadline) WHERE tender_deadline IS NOT NULL;

-- ============================================================================
-- BID ASSIGNMENTS
-- ============================================================================

CREATE TABLE bid_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bid_id UUID NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role bid_role NOT NULL DEFAULT 'contributor',
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bid_id, user_id)
);

CREATE INDEX idx_bid_assignments_bid ON bid_assignments(bid_id);
CREATE INDEX idx_bid_assignments_user ON bid_assignments(user_id);

-- ============================================================================
-- BID COMMENTS
-- ============================================================================

CREATE TABLE bid_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bid_id UUID NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES bid_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bid_comments_bid ON bid_comments(bid_id);
CREATE INDEX idx_bid_comments_parent ON bid_comments(parent_id) WHERE parent_id IS NOT NULL;

-- ============================================================================
-- BID CHECKLIST ITEMS
-- ============================================================================

CREATE TABLE bid_checklist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bid_id UUID NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bid_checklist_bid ON bid_checklist_items(bid_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_checklist_items ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by API)
CREATE POLICY "Service role full access on bids"
  ON bids FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on bid_assignments"
  ON bid_assignments FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on bid_comments"
  ON bid_comments FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on bid_checklist_items"
  ON bid_checklist_items FOR ALL
  USING (true)
  WITH CHECK (true);
