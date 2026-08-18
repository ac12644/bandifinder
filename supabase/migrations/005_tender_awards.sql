-- 005_tender_awards.sql
-- Add award fields to tenders table for Contract Award Notice data

ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS award_status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS award_winner_name TEXT,
  ADD COLUMN IF NOT EXISTS award_winner_country TEXT,
  ADD COLUMN IF NOT EXISTS award_value NUMERIC,
  ADD COLUMN IF NOT EXISTS award_date DATE,
  ADD COLUMN IF NOT EXISTS award_num_tenders_received INTEGER,
  ADD COLUMN IF NOT EXISTS award_notice_id TEXT;

-- Index for filtering awarded tenders
CREATE INDEX IF NOT EXISTS idx_tenders_award_status
  ON tenders(award_status) WHERE award_status != 'open';

-- Index for competitor analysis by winner name
CREATE INDEX IF NOT EXISTS idx_tenders_award_winner
  ON tenders(award_winner_name) WHERE award_winner_name IS NOT NULL;
