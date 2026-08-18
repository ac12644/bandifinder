-- ============================================================================
-- Bandifinder: Initial Database Schema
-- Supabase Postgres + RLS
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE onboarding_state AS ENUM (
  'pending',
  'org_created',
  'profile_started',
  'profile_complete',
  'active'
);

CREATE TYPE tender_decision_reason AS ENUM (
  'not_eligible',
  'too_competitive',
  'low_value',
  'capacity',
  'other'
);

CREATE TYPE notification_type AS ENUM (
  'deadline_approaching',
  'missing_doc',
  'amendment_published',
  'high_risk_clause',
  'high_fit_tender',
  'system'
);

CREATE TYPE ingestion_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed'
);

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_org_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT,
  country TEXT,
  industry TEXT,
  size TEXT CHECK (size IN ('1-10', '11-50', '50+')),
  onboarding_state onboarding_state NOT NULL DEFAULT 'pending',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_clerk ON organizations(clerk_org_id);

-- ============================================================================
-- USERS
-- ============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id TEXT UNIQUE NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  image_url TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_clerk ON users(clerk_user_id);
CREATE INDEX idx_users_org ON users(organization_id);

-- ============================================================================
-- COMPANY PROFILES
-- ============================================================================

CREATE TABLE company_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  description TEXT,
  industry TEXT,
  annual_revenue NUMERIC,
  employee_count INTEGER,
  legal_form TEXT,
  years_in_business INTEGER,
  website TEXT,
  -- Structured arrays stored as JSONB
  cpv_codes JSONB NOT NULL DEFAULT '[]',
  certifications JSONB NOT NULL DEFAULT '[]',
  technical_skills JSONB NOT NULL DEFAULT '[]',
  operating_regions JSONB NOT NULL DEFAULT '[]',
  services JSONB NOT NULL DEFAULT '[]',
  contract_size_min NUMERIC,
  contract_size_max NUMERIC,
  completeness_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id)
);

CREATE INDEX idx_company_profiles_org ON company_profiles(organization_id);
CREATE INDEX idx_company_profiles_completeness ON company_profiles(completeness_score);

-- ============================================================================
-- TENDERS
-- ============================================================================

CREATE TABLE tenders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL DEFAULT 'ted',
  external_id TEXT NOT NULL,
  publication_number TEXT,
  title TEXT NOT NULL,
  buyer TEXT,
  description TEXT,
  cpv_codes JSONB NOT NULL DEFAULT '[]',
  country TEXT,
  city TEXT,
  value NUMERIC,
  currency TEXT DEFAULT 'EUR',
  publication_date DATE,
  deadline DATE,
  procedure_type TEXT,
  contract_nature TEXT,
  is_framework_agreement BOOLEAN DEFAULT FALSE,
  sme_participation BOOLEAN DEFAULT FALSE,
  pdf_url TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source, external_id)
);

CREATE INDEX idx_tenders_external ON tenders(source, external_id);
CREATE INDEX idx_tenders_deadline ON tenders(deadline) WHERE deadline IS NOT NULL;
CREATE INDEX idx_tenders_country ON tenders(country);
CREATE INDEX idx_tenders_publication_date ON tenders(publication_date);
CREATE INDEX idx_tenders_cpv ON tenders USING GIN (cpv_codes);
CREATE INDEX idx_tenders_title_trgm ON tenders USING GIN (title gin_trgm_ops);

-- ============================================================================
-- FAVORITES
-- ============================================================================

CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tender_id UUID REFERENCES tenders(id) ON DELETE CASCADE,
  external_tender_id TEXT,
  tender_title TEXT NOT NULL,
  tender_value NUMERIC,
  tender_deadline DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, COALESCE(tender_id, '00000000-0000-0000-0000-000000000000'::UUID), COALESCE(external_tender_id, ''))
);

CREATE INDEX idx_favorites_user ON favorites(user_id);
CREATE INDEX idx_favorites_org ON favorites(organization_id);

-- ============================================================================
-- USER PREFERENCES
-- ============================================================================

CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Search defaults
  default_days_back INTEGER DEFAULT 7,
  default_min_value NUMERIC,
  default_max_value NUMERIC,
  default_countries JSONB DEFAULT '[]',
  default_cpv_codes JSONB DEFAULT '[]',
  keywords JSONB DEFAULT '[]',
  exclude_keywords JSONB DEFAULT '[]',
  -- Notification prefs
  notification_email BOOLEAN DEFAULT TRUE,
  notification_in_app BOOLEAN DEFAULT TRUE,
  email_digest TEXT DEFAULT 'daily' CHECK (email_digest IN ('daily', 'weekly', 'never')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_preferences_user ON user_preferences(user_id);

-- ============================================================================
-- ACTIVITY LOG
-- ============================================================================

CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_log_user ON activity_log(user_id);
CREATE INDEX idx_activity_log_org ON activity_log(organization_id);
CREATE INDEX idx_activity_log_event ON activity_log(event);
CREATE INDEX idx_activity_log_created ON activity_log(created_at);

-- ============================================================================
-- CONVERSATIONS & MESSAGES
-- ============================================================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_thread ON conversations(thread_id);
CREATE INDEX idx_conversations_user ON conversations(user_id);

CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conv_messages_conversation ON conversation_messages(conversation_id);
CREATE INDEX idx_conv_messages_created ON conversation_messages(created_at);

-- ============================================================================
-- SEARCH HISTORY
-- ============================================================================

CREATE TABLE search_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  filters JSONB DEFAULT '{}',
  result_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_search_history_user ON search_history(user_id);
CREATE INDEX idx_search_history_created ON search_history(created_at);

-- ============================================================================
-- TENDER DECISIONS
-- ============================================================================

CREATE TABLE tender_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tender_id UUID REFERENCES tenders(id) ON DELETE SET NULL,
  external_tender_id TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('proceed', 'skip')),
  reason tender_decision_reason,
  reason_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tender_decisions_user ON tender_decisions(user_id);
CREATE INDEX idx_tender_decisions_org ON tender_decisions(organization_id);
CREATE INDEX idx_tender_decisions_tender ON tender_decisions(tender_id);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- ============================================================================
-- SAVED SEARCHES
-- ============================================================================

CREATE TABLE saved_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query TEXT,
  filters JSONB NOT NULL DEFAULT '{}',
  notify BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_saved_searches_user ON saved_searches(user_id);
CREATE INDEX idx_saved_searches_org ON saved_searches(organization_id);

-- ============================================================================
-- INGESTION JOBS
-- ============================================================================

CREATE TABLE ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL DEFAULT 'ted',
  status ingestion_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  tenders_found INTEGER DEFAULT 0,
  tenders_new INTEGER DEFAULT 0,
  tenders_updated INTEGER DEFAULT 0,
  amendments_detected INTEGER DEFAULT 0,
  error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ingestion_jobs_status ON ingestion_jobs(status);
CREATE INDEX idx_ingestion_jobs_created ON ingestion_jobs(created_at);

-- ============================================================================
-- TENDER AMENDMENTS
-- ============================================================================

CREATE TABLE tender_amendments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingestion_job_id UUID REFERENCES ingestion_jobs(id) ON DELETE SET NULL
);

CREATE INDEX idx_tender_amendments_tender ON tender_amendments(tender_id);
CREATE INDEX idx_tender_amendments_detected ON tender_amendments(detected_at);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON company_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON saved_searches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_amendments ENABLE ROW LEVEL SECURITY;

-- Tenders are public read (all users can search tenders)
CREATE POLICY "Tenders are viewable by everyone" ON tenders
  FOR SELECT USING (true);

-- Tender amendments are public read
CREATE POLICY "Amendments are viewable by everyone" ON tender_amendments
  FOR SELECT USING (true);

-- Ingestion jobs are viewable by everyone (admin controls via API)
CREATE POLICY "Ingestion jobs are viewable" ON ingestion_jobs
  FOR SELECT USING (true);

-- Service role has full access (all policies below are for anon/authenticated)
-- The API uses service_role key, so RLS is bypassed.
-- These policies exist for future Supabase client-side usage.

-- Organizations: members can view their own org
CREATE POLICY "Users can view own organization" ON organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM users WHERE clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

-- Users: can view users in same org
CREATE POLICY "Users can view org members" ON users
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

-- Company profiles: org members can view
CREATE POLICY "Org members can view company profile" ON company_profiles
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

-- Favorites: users see their own
CREATE POLICY "Users can manage own favorites" ON favorites
  FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

-- User preferences: users see their own
CREATE POLICY "Users can manage own preferences" ON user_preferences
  FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

-- Activity log: users see their own
CREATE POLICY "Users can view own activity" ON activity_log
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

-- Conversations: users see their own
CREATE POLICY "Users can manage own conversations" ON conversations
  FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

-- Conversation messages: through conversation ownership
CREATE POLICY "Users can view own conversation messages" ON conversation_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id IN (
        SELECT id FROM users WHERE clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );

-- Search history: users see their own
CREATE POLICY "Users can view own search history" ON search_history
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

-- Tender decisions: org members can view
CREATE POLICY "Org members can manage tender decisions" ON tender_decisions
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM users WHERE clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

-- Notifications: users see their own
CREATE POLICY "Users can manage own notifications" ON notifications
  FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

-- Saved searches: org members can manage
CREATE POLICY "Org members can manage saved searches" ON saved_searches
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM users WHERE clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );
