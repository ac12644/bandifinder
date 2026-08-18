# Bandifinder API

Hono.js backend powering Bandifinder.it — multi-agent AI, explainable scoring, ingestion pipelines, bid management, and Stripe billing. Deployed on Vercel Serverless.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Hono.js API Layer                      │
│  CORS → UserID → Observability → Audit → Rate Limit     │
│  → Sanitize → PII Detect → Route Handler                 │
└────────────────────────┬─────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  LangGraph   │ │   Scoring    │ │  Ingestion   │
│  Supervisor  │ │   Engine     │ │  Pipeline    │
│  5 Agents    │ │  6 Components│ │  3 Connectors│
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
  ┌────┴────┐    ┌──────┴──────┐   ┌─────┴─────┐
  │OpenRouter│    │  Supabase   │   │  TED API  │
  │  (LLM)  │    │  Postgres   │   │  + ANAC   │
  └─────────┘    └─────────────┘   └───────────┘
       │                │
  ┌────┴────┐    ┌──────┴──────┐
  │Pinecone │    │   Stripe    │
  │(Vectors)│    │  (Billing)  │
  └─────────┘    └─────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Hono.js |
| Runtime | Node.js / Vercel Serverless |
| AI Agents | LangGraph + LangChain |
| LLM | OpenRouter (Gemma, GPT, Claude) |
| Embeddings | OpenAI text-embedding-3-small |
| Database | Supabase Postgres |
| Vectors | Pinecone |
| Billing | Stripe |
| Auth | Clerk (JWT, Organizations, RBAC) |
| Monitoring | Sentry, custom observability |

## Setup

### Prerequisites
- Node.js 20+

### Install
```bash
cd api && npm install
```

### Environment Variables

Create `api/.env`:
```env
# LLM
OPENROUTER_API_KEY=sk-or-v1-...

# Embeddings
OPENAI_API_KEY=sk-...

# Database
SUPABASE_URL=https://....supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Vectors
PINECONE_API_KEY=pcsk_...

# Auth
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...

# Billing
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
FRONTEND_URL=http://localhost:3000

# Monitoring
SENTRY_DSN=https://...

# Ingestion
CRON_SECRET=your-cron-secret

# Admin
ADMIN_UID=user_...
```

### Run
```bash
npm run dev
# → http://localhost:3001
```

## API Endpoints

### Health & Monitoring
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API info |
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus/JSON metrics |
| GET | `/getAdminMetrics` | Platform stats (admin) |

### Agent (AI Chat)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agent/chat` | JSON response |
| POST | `/agent/stream` | SSE streaming |

### Tenders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tenders` | List/search with filters |
| GET | `/tenders/:id` | Detail (wrapped: `{ tender }`) |
| GET | `/tenders/:id/analysis` | Scoring + eligibility + recommendation |
| POST | `/tenders/search` | Full-text search |
| POST | `/tenders/favorite` | Toggle favorite |
| POST | `/tenders/graphrag` | GraphRAG hybrid search |
| POST | `/tenders/semantic` | Semantic vector search |
| POST | `/tenders/similar` | Find similar tenders |

### Bids
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/bids` | List (optional `?status=` filter) |
| GET | `/bids/counts` | Count per status |
| POST | `/bids` | Create bid from tender |
| GET | `/bids/:id` | Bid detail |
| PATCH | `/bids/:id` | Update status/priority/notes |
| DELETE | `/bids/:id` | Delete bid |
| GET/POST | `/bids/:id/outcome` | Record bid outcome |
| GET/POST | `/bids/:id/comments` | Threaded comments |
| GET/PATCH | `/bids/:id/checklist` | Compliance checklist |
| PATCH | `/bids/:id/checklist/:itemId` | Toggle checklist item |
| GET/POST/DELETE | `/bids/:id/assignments` | Team role assignments |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/outcomes` | Win/loss stats, by segment, competitors, lessons |
| GET | `/analytics/kpis` | Dashboard KPIs (real outcome data) |
| GET | `/analytics/market-competitors` | TED award-based market competitors |

### Billing (Stripe)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/billing` | Current plan + subscription |
| GET | `/billing/plans` | Plan tiers with limits |
| POST | `/billing/checkout` | Create Stripe checkout session |
| POST | `/billing/portal` | Create Stripe customer portal |
| POST | `/billing/cancel` | Cancel subscription |

### Company
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/company/profile` | Company profile |
| POST | `/company/profile` | Update profile |
| GET | `/company/completeness` | Profile completeness score |
| GET | `/company/recommendations` | AI recommendations |

### Ingestion (Admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ingestion/run` | Trigger ingestion (source: ted/anac/all) |
| POST | `/ingestion/awards` | Trigger award ingestion |
| GET | `/ingestion/jobs` | Job history |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/preferences` | User preferences |
| GET | `/notifications` | User notifications |
| PATCH | `/notifications/:id/read` | Mark read |
| GET/POST/DELETE | `/saved-searches` | Saved search alerts |
| POST | `/webhooks/clerk` | Clerk auth webhook |
| POST | `/webhooks/stripe` | Stripe billing webhook |
| GET/POST | `/organizations` | Organization CRUD |

## Key Systems

### Scoring Engine (`lib/scoring/`)

6-component scoring (0-100 total):

| Component | Max Score | Logic |
|-----------|-----------|-------|
| CPV Match | 25 | Exact/class/group/division prefix matching |
| Revenue Fit | 20 | Contract size range or revenue-ratio |
| Geographic | 15 | Operating regions + EU proximity |
| Certifications | 20 | ISO 9001/14001/27001/45001, SOA |
| Experience | 10 | Years in business + employee count |
| Deadline | 10 | Days remaining urgency bands |

Plus deterministic eligibility checklist → BID / REVIEW / SKIP recommendation.
Cached per-org in `tender_scores` table with 24h TTL.

### Ingestion Pipeline (`lib/ingestion/`)

Modular connector system:
- **TED Connector** — TED API v3 search notices
- **ANAC Connector** — Italian ANAC monthly CSV archives
- **TED Award Connector** — Contract award notices for competitor intel

Runner orchestrates: job record → fetch → dedup (ON CONFLICT + 8-field amendment detection) → Pinecone vectors → saved search notifications.

### Billing Middleware (`middleware/billing.ts`)

| Guard | Purpose |
|-------|---------|
| `requireFeature(feature)` | Gate pipeline/export/api access by plan |
| `searchLimitMiddleware()` | Daily search quota per plan |
| `checkBidLimit()` | Active bid count limit per plan |

Plan tiers: Free (5 searches/day, 3 bids) → Starter (€99) → Pro (€249) → Enterprise.

### GraphRAG (`lib/graphrag/`)

Hybrid retrieval: vector search → entity extraction → knowledge graph traversal → merge & rerank.

Graph nodes: Tender, CPV Code, Contracting Authority, Region.
Edges: HAS_CPV, ISSUED_BY, SIMILAR_TO, PARENT_OF (CPV hierarchy).

### Security Middleware (`middleware/`)

- Rate limiting (token bucket per user/IP, configurable per route group)
- Input sanitization (XSS, SQL injection, prompt injection)
- PII detection (GDPR-compliant filtering)
- Audit logging (all requests)
- Clerk JWT verification + org context extraction

### Observability (`lib/observability/`)

- Structured logging with levels + context
- Prometheus-compatible metrics (HTTP duration, agent execution, LLM tokens, errors)
- W3C Trace Context distributed tracing
- Sentry integration (all catch blocks forward exceptions)

## Project Structure

```
api/src/
├── app.ts                  # Hono app, middleware, route mounting
├── server.ts               # Local dev server (port 3001)
├── index.ts                # Vercel entry point
├── instrument.ts           # Sentry SDK init (imported first)
├── agents/
│   ├── base.ts             # Agent factory (OpenRouter)
│   ├── supervisor.ts       # LangGraph supervisor
│   ├── search.ts           # Search agent
│   ├── analysis.ts         # Analysis agent
│   ├── ranking.ts          # Ranking agent
│   ├── personalization.ts  # Personalization agent
│   ├── contractReview.ts   # Contract review agent
│   └── tools/              # Agent tool definitions
├── routes/
│   ├── tenders.ts          # Tender search, detail, analysis
│   ├── bids.ts             # Bid CRUD + sub-resources
│   ├── billing.ts          # Stripe plans, checkout, portal
│   ├── analytics.ts        # Outcomes, KPIs, market competitors
│   ├── ingestion.ts        # Admin ingestion triggers
│   ├── webhooks.ts         # Clerk + Stripe webhooks
│   ├── company.ts          # Profile + completeness
│   ├── agent.ts            # AI chat + stream
│   ├── notifications.ts    # User notifications
│   ├── saved-searches.ts   # Saved search alerts
│   ├── organizations.ts    # Org management
│   ├── preferences.ts      # User preferences
│   ├── suggestions.ts      # AI suggestions
│   ├── compare.ts          # Tender comparison
│   └── export.ts           # Data export
├── lib/
│   ├── db/                 # Supabase query layers
│   │   ├── users.ts
│   │   ├── organizations.ts
│   │   ├── tenders.ts
│   │   ├── bids.ts
│   │   ├── bid-assignments.ts
│   │   ├── bid-comments.ts
│   │   ├── bid-checklist.ts
│   │   ├── bid-outcomes.ts
│   │   ├── company-profiles.ts
│   │   ├── tender-scores.ts
│   │   ├── tender-amendments.ts
│   │   ├── ingestion-jobs.ts
│   │   ├── notifications.ts
│   │   ├── saved-searches.ts
│   │   └── admin-metrics.ts
│   ├── scoring/
│   │   ├── engine.ts       # scoreTender() + quickScore()
│   │   ├── components.ts   # 6 scoring components
│   │   └── compliance.ts   # Eligibility checklist
│   ├── ingestion/
│   │   ├── connector.ts    # TenderConnector interface
│   │   ├── ted-connector.ts
│   │   ├── anac-connector.ts
│   │   ├── ted-award-connector.ts
│   │   ├── award-processor.ts
│   │   ├── deduplicator.ts
│   │   ├── notification-generator.ts
│   │   └── runner.ts       # Orchestrator
│   ├── graphrag/
│   │   ├── entities.ts     # Node/edge types
│   │   ├── knowledgeGraph.ts
│   │   └── retriever.ts    # Hybrid retrieval
│   ├── observability/      # Metrics, logging, tracing
│   ├── stripe.ts           # Plan config + Stripe helpers
│   ├── pinecone.ts         # Vector search client
│   ├── supabase.ts         # Supabase client
│   └── types.ts            # TED API types
└── middleware/
    ├── index.ts            # Security stacks (rate limit, sanitize, PII, audit)
    └── billing.ts          # Plan-based feature/quota gates
```

## Authentication

Clerk JWT with organization context:

```
Authorization: Bearer <clerk-jwt>
```

Development shortcut (disabled in production):
```
x-user-id: user_123
```

Clerk tokens include `orgId`, `orgRole`, `orgSlug` when available. Webhooks sync Clerk users/orgs to Supabase.

## Deployment

Deployed as Vercel Serverless Function. Frontend rewrites `/api/*` → API deployment.

```bash
vercel deploy
```

Cron job (`vercel.json`): `0 */6 * * *` — runs TED + ANAC + award ingestion every 6 hours.
