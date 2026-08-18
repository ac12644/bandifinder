# Bandifinder.it — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Vercel Edge Network                         │
│  ┌────────────────────────────┐  ┌────────────────────────────────┐ │
│  │   Next.js 15 Frontend      │  │   Hono.js API (Serverless)     │ │
│  │   App Router + Turbopack   │  │   /api/* rewrite               │ │
│  │   Port 3000                │  │   Port 3001 (dev)              │ │
│  └─────────────┬──────────────┘  └──────────────┬─────────────────┘ │
└────────────────┼─────────────────────────────────┼──────────────────┘
                 │                                 │
        ┌────────┴────────┐              ┌─────────┴─────────┐
        │  Clerk (Auth)   │              │  Supabase Postgres │
        │  JWT + Orgs     │              │  (Source of Truth) │
        └────────┬────────┘              └─────────┬─────────┘
                 │                                 │
        ┌────────┴────────┐              ┌─────────┴─────────┐
        │  Sentry         │              │  Pinecone          │
        │  (Monitoring)   │              │  (Vectors Only)    │
        └─────────────────┘              └───────────────────┘
                                                   │
                                         ┌─────────┴─────────┐
                                         │  Stripe (Billing)  │
                                         └───────────────────┘
```

## Frontend

### Stack
- **Next.js 15** with App Router, React 19, Turbopack
- **ShadCN UI** + Radix primitives + Tailwind CSS
- **TanStack Query** for server state (caching, mutations, optimistic updates)
- **TanStack Table** for sortable/paginated data tables
- **dnd-kit** for Kanban drag-and-drop
- **Clerk** for auth UI (Italian locale), org management, RBAC
- **Sentry** for error tracking + session replay (consent-gated)
- **Vercel Analytics** (consent-gated)

### Page Structure

```
/                         AI Chat (public, agent SSE streaming)
/dashboard                KPIs, high-fit tenders, urgent deadlines
/tenders                  Search + filters + paginated table
/tenders/[id]             Detail, scoring breakdown, eligibility, BID/SKIP
/pipeline                 Kanban board (6 columns, drag-and-drop)
/bids/[id]                Bid detail, checklist, comments, timeline
/analytics                Win/loss, competitors, lessons learned
/onboarding/organization  Org creation (Clerk)
/onboarding/profile       Profile wizard (80% completeness gate)
/settings/profile         Company profile editor
/settings/notifications   Notification preferences
/settings/billing         Stripe plans, checkout, portal
/settings/team            Team members (Clerk org memberships)
/admin                    Platform metrics dashboard
/admin/ingestion          Manual ingestion trigger + job history
```

### Key Patterns

**OnboardingGate** — Global wrapper in root layout. All signed-in users are redirected to onboarding until org is created and profile reaches 80% completeness.

**useApiQuery / useApiMutation** — Thin wrappers around TanStack Query that inject Clerk JWT + user ID headers automatically.

**Cookie Consent** — GDPR banner in root layout. Controls Sentry replay and Vercel Analytics. Consent stored in localStorage. Sentry error tracking (without PII) runs regardless.

## API

### Request Pipeline

```
Request
  │
  ▼
CORS (origin whitelist + *.vercel.app)
  │
  ▼
User ID Extraction (x-user-id header)
  │
  ▼
Observability (logging, metrics, tracing)
  │
  ▼
Audit Logging
  │
  ▼
Security Stack (per-route group):
  ├── Search routes  → rate limit (burst: 20)
  ├── Agent routes   → rate limit (burst: 5) + prompt sanitization
  ├── Export routes   → rate limit (burst: 3)
  ├── Standard routes → rate limit (burst: 30)
  └── Webhook routes  → no rate limit (signature verified)
  │
  ▼
Billing Middleware (optional per-route):
  ├── requireFeature("pipeline"|"export"|"api")
  ├── searchLimitMiddleware() → daily quota
  └── checkBidLimit() → active bid count
  │
  ▼
Route Handler
```

### Multi-Agent System (LangGraph)

```
User Message
  │
  ▼
┌─────────────────────────────────────────────────┐
│              Supervisor Agent                     │
│  Intent Classification → Agent Selection         │
│  Coordination → Response Assembly                │
└───────┬──────┬──────┬──────┬──────┬─────────────┘
        │      │      │      │      │
        ▼      ▼      ▼      ▼      ▼
   ┌────────┐ ┌────┐ ┌────┐ ┌────┐ ┌────────┐
   │ Search │ │Anal│ │Rank│ │Pers│ │Contract│
   │        │ │ysis│ │ing │ │onal│ │ Review │
   └───┬────┘ └──┬─┘ └──┬─┘ └──┬─┘ └───┬────┘
       │         │      │      │        │
       ▼         ▼      ▼      ▼        ▼
   TED API    Company  Scoring  User    Document
   Pinecone   Profile  Engine   Prefs   Parsing
   GraphRAG
```

| Agent | Tools | Purpose |
|-------|-------|---------|
| Search | searchTenders, semanticSearch, findSimilar | Discover tenders via TED API + vectors |
| Analysis | analyzeEligibility, getBestTenders, compareWithProfile | Score company against tender requirements |
| Ranking | rankTenders, createShortlist, scoreByPreferences | Multi-criteria sorting and top picks |
| Personalization | getPersonalizedSuggestions, updatePreferences | Tailor results to company history |
| Contract Review | extractClauses, assessRisks | Flag contractual risks and obligations |

LLM: OpenRouter (supports Gemma, GPT, Claude models).
Embeddings: OpenAI text-embedding-3-small (512 dims).
Streaming: Server-Sent Events for real-time token delivery.

### Scoring Engine

Deterministic, explainable scoring (no LLM required):

```
Tender + Company Profile
  │
  ▼
┌──────────────────────────────────────────┐
│  6 Scoring Components (0–100 total)      │
│                                          │
│  CPV Match ·········· 0–25  (prefix)     │
│  Revenue Fit ········ 0–20  (ratio)      │
│  Geographic ········· 0–15  (regions)    │
│  Certifications ····· 0–20  (ISO, SOA)   │
│  Experience ········· 0–10  (years)      │
│  Deadline ··········· 0–10  (urgency)    │
│                                          │
│  Each returns: { score, maxScore,        │
│                  explanation (Italian) }  │
└──────────────────────┬───────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────┐
│  Eligibility Checklist (pass/fail)       │
│  CPV overlap, geography, capacity,       │
│  certifications, SME, deadline, profile  │
└──────────────────────┬───────────────────┘
                       │
                       ▼
              Recommendation:
              BID (≥70) / REVIEW (40–69) / SKIP (<40)

              Cached per-org, 24h TTL
```

### Ingestion Pipeline

```
Vercel Cron (every 6h) or Admin Manual Trigger
  │
  ▼
┌─────────────────────────────────────────────┐
│  Runner (orchestrator)                       │
│                                              │
│  1. Create job record in DB                  │
│  2. Detect date range from last completed    │
│     job (1-day overlap for safety)           │
│  3. Fetch via connector:                     │
│     ├── TED Connector (API v3 search)        │
│     ├── ANAC Connector (monthly CSV zips)    │
│     └── TED Award Connector (CAN notices)    │
│  4. Deduplicator:                            │
│     ├── ON CONFLICT upsert (external_id)     │
│     └── Amendment detection (8 fields)       │
│  5. Pinecone vector upsert (non-fatal)       │
│  6. Notification generator:                  │
│     └── Match new tenders → saved searches   │
│  7. Update job record (completed/failed)     │
└─────────────────────────────────────────────┘
```

Amendment detection compares: title, buyer, description, value, deadline, cpv_codes, procedure_type, contract_nature.

Award processing links CAN (Contract Award Notices) to existing tenders by buyer + CPV + title similarity for competitor intelligence.

### Billing (Stripe)

```
┌──────────────────────────────────────────────────────────┐
│  Plan Tiers                                              │
│                                                          │
│  Free ···· €0 ···· 5 searches/day · 1 user · 3 bids     │
│  Starter · €99 ··· 50/day · 3 users · 20 bids · export  │
│  Pro ····· €249 ·· unlimited · 10 users · unlimited      │
│  Enterprise ····· custom · unlimited · SSO               │
└──────────────────────────────────────────────────────────┘

Checkout: POST /billing/checkout → Stripe Checkout → redirect
Webhook:  checkout.session.completed → update org.plan + stripe_subscription_id
          subscription.updated/deleted → sync plan changes
          invoice.payment_failed → flag org
Portal:   POST /billing/portal → Stripe Customer Portal
```

Middleware enforces limits at the API layer, not just UI.

## Database

### Supabase Postgres (Source of Truth)

```
users
  ├── id (uuid, PK)
  ├── clerk_user_id (unique)
  ├── organization_id (FK → organizations)
  ├── email, name, role
  └── created_at, updated_at

organizations
  ├── id (uuid, PK)
  ├── clerk_org_id (unique)
  ├── name, slug
  ├── plan (free/starter/pro/enterprise)
  ├── stripe_customer_id, stripe_subscription_id
  └── onboarding_state

company_profiles
  ├── id (uuid, PK)
  ├── organization_id (FK, unique)
  ├── company_name, industry, description
  ├── cpv_codes[], operating_regions[], certifications[]
  ├── annual_revenue, employee_count, years_in_business
  ├── contract_size_min, contract_size_max
  ├── completeness_score (0–100)
  └── services[], website

tenders
  ├── id (uuid, PK)
  ├── external_id (unique — TED notice ID or ANAC CIG)
  ├── source (ted/anac)
  ├── title, description, buyer_name, buyer_country
  ├── value_amount, value_currency
  ├── deadline, publication_date
  ├── cpv_codes[], procedure_type, contract_nature
  ├── award_status, award_winner_name, award_value, ...
  └── raw_data (jsonb)

tender_scores
  ├── tender_id + organization_id (composite PK)
  ├── total_score, components (jsonb), eligibility (jsonb)
  ├── recommendation (BID/REVIEW/SKIP)
  └── computed_at (24h TTL)

bids
  ├── id (uuid, PK)
  ├── tender_id (FK), organization_id (FK)
  ├── status (new/reviewing/preparing/submitted/won/lost)
  ├── priority (low/medium/high/critical)
  ├── notes, decision (bid/skip)
  └── created_by (FK → users)

bid_assignments    (bid_id, user_id, role: lead/contributor/reviewer)
bid_comments       (bid_id, user_id, content, parent_id for threads)
bid_checklist_items (bid_id, label, checked, sort_order)
bid_outcomes       (bid_id, outcome, winning_bidder, winning_amount,
                    num_bidders, reason, lessons_learned, ...)

ingestion_jobs     (source, status, date range, counts, error)
tender_amendments  (tender_id, field_name, old_value, new_value)
notifications      (user_id, type, title, body, read, tender_id)
saved_searches     (user_id, name, filters jsonb)
user_preferences   (user_id, notification settings, search defaults)
favorites          (user_id, tender_id)
```

### Pinecone (Vectors Only)

Single index `bandifinder`, 512 dimensions (text-embedding-3-small), cosine metric.

Used for:
- Semantic tender search (agent tools + `/tenders/semantic`)
- Similar tender discovery (`/tenders/similar`)
- GraphRAG hybrid retrieval (vector candidates → graph traversal → rerank)

Vectors are upserted during ingestion. Structured data lives in Supabase.

## Auth Flow

```
Browser → Clerk SignIn/SignUp
  │
  ▼
Clerk issues JWT (includes orgId, orgRole)
  │
  ├──→ Frontend: useAuth() reads user + org context
  │
  ├──→ API: Authorization header → Clerk JWT verify
  │         x-user-id header (dev only)
  │
  └──→ Webhooks: Clerk → POST /webhooks/clerk
                  ├── user.created → insert into users table
                  ├── organization.created → insert into organizations table
                  └── organizationMembership.created → link user ↔ org
```

Agent tools resolve: `Clerk userId → getUserByClerkId() → dbUser.organization_id → getCompanyProfile(orgId)`.

## Monitoring

### Sentry
- **Frontend**: `@sentry/nextjs` with tunnel route (`/monitoring`) to bypass ad-blockers
  - Error tracking (always on)
  - Session Replay (consent-gated)
  - Router transition tracking
- **API**: `@sentry/node` imported before all other modules
  - Wired into observability middleware catch blocks
  - User context (`Sentry.setUser`) from Clerk auth

### Observability Stack (API)
- **Logging**: Structured JSON with levels, request context, user IDs
- **Metrics**: Prometheus-compatible counters/histograms (HTTP duration, agent execution, LLM tokens, errors)
- **Tracing**: W3C Trace Context with span hierarchy
- **Endpoint**: `GET /metrics` (JSON or Prometheus format)

## Deployment

Both frontend and API deploy to Vercel from the same repo:
- Frontend: root `package.json`, `next.config.ts`
- API: `backend/` directory, separate `package.json`, `vercel.json`

Vercel cron (`vercel.json`): `0 */6 * * *` triggers `app/api/cron/ingest-tenders/route.ts` which calls the ingestion runner for TED + ANAC + awards.

## Security

| Layer | Implementation |
|-------|---------------|
| Auth | Clerk JWT verification, org-scoped access |
| Rate Limiting | Token bucket per user/IP, configurable per route group |
| Input Sanitization | XSS, SQL injection, prompt injection detection |
| PII Detection | GDPR-compliant filtering before logging |
| Audit Logging | All requests logged with user context |
| CORS | Origin whitelist (localhost, bandifinder.it, *.vercel.app) |
| Webhooks | Clerk signature verification, Stripe signature verification |
| Billing | Server-side plan enforcement (not just UI gating) |
| GDPR | Cookie consent banner, conditional PII collection |
