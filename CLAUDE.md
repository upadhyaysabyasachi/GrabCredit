# CLAUDE.md — GrabCredit

## Project Overview

GrabCredit is a BNPL (Buy Now Pay Later) eligibility and checkout system for GrabOn's deal platform. Read `docs/PRD.md` for the full product requirements document.

**Tech Stack:**
- **Backend:** Python 3.11+ with FastAPI
- **Frontend:** Next.js 14 (App Router) with TypeScript, Tailwind CSS
- **Database:** Supabase (Postgres)
- **MCP Server:** Python with FastMCP
- **Mock Partner:** Python (simulates PayU/LazyPay)

## Project Structure

```
grabcredit/
├── CLAUDE.md                  # You are here
├── README.md                  # Setup instructions and project overview
├── .env.example               # Environment variables template
├── docs/
│   ├── PRD.md                 # Full Product Requirements Document (READ THIS FIRST)
│   ├── API_CONTRACTS.md       # API endpoint specifications
│   ├── QA_PLAN.md             # Test plan with negative cases
│   ├── OBSERVABILITY_PLAN.md  # Metrics, logs, alerts
│   └── ROLLOUT_PLAN.md        # Gating, rollback, kill/iterate/scale
├── sql/
│   ├── 001_create_tables.sql  # Core schema
│   └── 002_seed_data.sql      # Test users, merchants, deals
├── backend/
│   ├── requirements.txt
│   ├── main.py                # FastAPI app entry point
│   ├── config.py              # Settings and Supabase client
│   ├── models.py              # Pydantic models (decision, checkout, callback)
│   ├── eligibility/
│   │   ├── engine.py          # Rules engine — 5 rules, reason codes, recovery options
│   │   └── rules.py           # Individual rule implementations
│   ├── checkout/
│   │   ├── orchestrator.py    # State machine, partner dispatch, retry logic
│   │   └── state_machine.py   # Valid transitions, terminal states
│   ├── partner/
│   │   ├── mock_partner.py    # Mock PayU/LazyPay service
│   │   └── client.py          # Partner API client with retry
│   ├── webhooks/
│   │   └── callback_handler.py # Webhook receiver, idempotency, dedup
│   ├── api/
│   │   ├── eligibility.py     # POST /api/eligibility/check
│   │   ├── checkout.py        # POST /api/checkout/initiate, GET /api/checkout/{id}/status
│   │   ├── webhook.py         # POST /api/webhook/partner-callback
│   │   ├── dashboard.py       # GET endpoints for operator dashboard
│   │   └── simulator.py       # GET/POST endpoints for scenario simulator
│   ├── mcp_server/
│   │   └── server.py          # MCP server with check_bnpl_eligibility and initiate_bnpl_checkout
│   └── demo_mcp.py            # Automated MCP demo script (connects as MCP client, runs 5 scenarios)
├── frontend/
│   ├── package.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx           # Root layout with nav
│   │   │   ├── page.tsx             # Landing / home
│   │   │   ├── simulator/
│   │   │   │   └── page.tsx         # Scenario Simulator (test harness)
│   │   │   ├── checkout/
│   │   │   │   └── page.tsx         # Consumer checkout experience
│   │   │   └── dashboard/
│   │   │       ├── page.tsx         # Operator dashboard — decisions
│   │   │       ├── checkouts/
│   │   │       │   └── page.tsx     # Checkout status view
│   │   │       └── callbacks/
│   │   │           └── page.tsx     # Callback logs view
│   │   ├── components/
│   │   │   ├── JsonViewer.tsx
│   │   │   └── StatusBadge.tsx
│   │   ├── lib/
│   │   │   ├── api.ts               # API client functions
│   │   │   └── types.ts             # TypeScript types matching backend models
│   │   └── hooks/
│   │       └── usePolling.ts        # Polling hook for checkout status
│   └── public/
└── .gitignore
```

## Build Order (Follow This Sequence)

### Phase 1: Database & Backend Core
1. **Set up Supabase project** — Run `sql/001_create_tables.sql` then `sql/002_seed_data.sql` in Supabase SQL editor.
2. **Backend scaffolding** — Create `backend/` with FastAPI, install deps from `requirements.txt`, configure Supabase client in `config.py`.
3. **Models** — Define Pydantic models in `models.py` matching the Decision Object Schema and Checkout State Machine from the PRD.
4. **Eligibility Engine** — Implement the 5 rules in `eligibility/rules.py`, the engine in `eligibility/engine.py` that runs all rules, generates reason codes, calculates recovery options (including partial BNPL splits).
5. **Checkout Orchestrator** — State machine in `checkout/state_machine.py`, orchestrator in `checkout/orchestrator.py` with partner dispatch and retry logic (exponential backoff: 1s, 2s, 4s, max 3 attempts).
6. **Mock Partner** — `partner/mock_partner.py` that accepts checkout requests and sends callbacks after a configurable delay. Must support: success, decline, transient failure (5xx), timeout, and duplicate callback modes.
7. **Webhook Handler** — `webhooks/callback_handler.py` with idempotency check, duplicate detection, state transition.
8. **API Routes** — Wire everything together in `api/` — eligibility check, checkout initiation, webhook receiver, dashboard data endpoints, simulator endpoints.

### Phase 2: Frontend
9. **Next.js setup** — Initialize with App Router, TypeScript, Tailwind CSS.
10. **API client & types** — `lib/api.ts` and `lib/types.ts` matching backend models.
11. **Scenario Simulator page** — The primary demo surface. Form to select user, merchant, cart value, mock partner behavior. Shows full decision object, state transitions, raw JSON.
12. **Consumer Checkout page** — Simulated deal page → eligibility check → approval/decline with recovery options → checkout flow → result.
13. **Operator Dashboard** — Decision logs table, checkout status view, callback logs with duplicate flags.

### Phase 3: MCP Server & Polish
14. **MCP Server** — `mcp_server/server.py` exposing `check_bnpl_eligibility` and `initiate_bnpl_checkout` tools. Supports stdio (Claude Desktop) and SSE (standalone) transports. `initiate_bnpl_checkout` delegates to the backend REST API for partner dispatch.
15. **End-to-end testing** — Run through all 11 pre-built demo scenarios from PRD Section 11.2.
16. **Production handoff docs** — Complete `docs/` folder.

## Key Implementation Rules

### Eligibility Engine
- All 5 rules MUST run even if one fails — collect ALL reason codes, not just the first.
- Recovery options are generated ONLY for declined decisions:
  - `CART_VALUE_EXCEEDS_LIMIT` (sole failure) → `PARTIAL_BNPL` with calculated split
  - `KYC_INCOMPLETE` → `INLINE_KYC` with CTA to toggle KYC status
  - `CREDIT_TIER_INSUFFICIENT` → `UPGRADE_PATH` with guidance
  - `MERCHANT_NOT_ELIGIBLE` → `ALT_DEALS` (optional)
  - `VELOCITY_LIMIT_EXCEEDED` → NO recovery options (abuse category)
- Partial BNPL is ONLY offered when `CART_VALUE_EXCEEDS_LIMIT` is the SOLE failing rule.
- Every decision gets a `decision_id` (UUID) and `expires_at` (15 minutes from creation).
- Velocity check: count rows in `velocity_events` for user in last 60 minutes. Limit = 5.

### Checkout State Machine
- Valid transitions: `INITIATED → PENDING → SUCCESS | DECLINED | FAILED`; `PENDING → TIMED_OUT`
- NO backward transitions. Terminal states are immutable.
- Idempotency key format: `grabcredit_{decision_id}_{timestamp_ms}`
- On partner 5xx: retry with same idempotency key, exponential backoff (1s, 2s, 4s), max 3 attempts.
- On partner 4xx: do NOT retry, mark FAILED immediately.
- Timeout: if no callback in 5 minutes, transition to TIMED_OUT.

### Mock Partner Service
- Runs as a background async task (or separate thread) within the FastAPI app.
- Configurable behavior via `partner_behavior` field in checkout request:
  - `success` — sends success callback after 2-3 second delay
  - `decline` — sends declined callback after 1-2 second delay
  - `transient_failure` — returns 500 on first 1-2 attempts, then succeeds
  - `timeout` — never sends callback (tests timeout flow)
  - `duplicate` — sends same success callback twice
- Callback is sent to GrabCredit's own webhook endpoint (localhost loopback).

### Webhook Handler
- Validate payload schema first. Return 400 for invalid payloads.
- Check `idempotency_key` against `callback_logs`. If exists, log as duplicate, return 200, no state change.
- For new callbacks: transition checkout state, log to `callback_logs`, return 200.
- Must respond within 5 seconds.

### Frontend
- Use Tailwind CSS for styling. Clean, professional look — not flashy.
- Scenario Simulator: form on left, results on right. Include raw JSON toggle.
- Checkout page: step-by-step flow with clear state indicators.
- Dashboard: tables with search/filter. Color-coded status badges.
- All API calls go through `lib/api.ts` — never call backend directly from components.
- Use polling (not websockets) for checkout status updates — poll every 2 seconds.

### Database
- Use UUIDs for all primary keys (Supabase `gen_random_uuid()`).
- All tables have `created_at` with `DEFAULT now()`.
- `eligibility_decisions.reason_codes` is `TEXT[]` (Postgres array).
- `eligibility_decisions.risk_signals`, `emi_terms`, `recovery_options` are `JSONB`.
- `checkout_attempts.idempotency_key` has a `UNIQUE` constraint.
- `callback_logs.is_duplicate` is `BOOLEAN DEFAULT false`.
- `callback_logs.is_late` is `BOOLEAN DEFAULT false` (callback arrived after terminal state).
- `checkout_attempts.emi_tenure_months` is `INTEGER` (selected EMI tenure).
- Index `velocity_events` on `(user_id, created_at)` for fast lookups.
- Database uses `grabcredit` schema (not `public`) to isolate from other Supabase data.

## Environment Variables

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_API_URL=http://localhost:8000
CORS_ORIGINS=http://localhost:3000,http://localhost:3001  # comma-separated, env-driven for deployment
```

## Commands

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev

# MCP Server (standalone SSE on port 8001)
cd backend
source .venv/bin/activate
python -m mcp_server.server --transport sse

# MCP Server (stdio for Claude Desktop / Claude Code)
python -m mcp_server.server

# MCP Demo (requires backend + MCP server running)
python demo_mcp.py
```

### Claude Desktop Integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "grabcredit": {
      "command": "/path/to/grabcredit/backend/.venv/bin/python",
      "args": ["/path/to/grabcredit/backend/mcp_server/server.py"]
    }
  }
}
```

### Claude Code CLI Integration

```bash
claude mcp add grabcredit -- /path/to/grabcredit/backend/.venv/bin/python /path/to/grabcredit/backend/mcp_server/server.py
```

### Deployment

```bash
# Frontend: Vercel (root directory: frontend)
# Set NEXT_PUBLIC_API_URL to deployed backend URL

# Backend: Render (root directory: backend)
# Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BACKEND_URL, CORS_ORIGINS
# Start command: uvicorn main:app --host 0.0.0.0 --port $PORT
# Python version: 3.12 (via .python-version)
```

## Pre-Seeded Test Data (from sql/002_seed_data.sql)

### Users
| Name | KYC Status | Credit Tier | BNPL Limit | Purpose |
|------|-----------|-------------|------------|---------|
| Priya Sharma | completed | GOLD | ₹20,000 | Happy path user |
| Rahul Verma | completed | SILVER | ₹10,000 | Cart limit testing, partial BNPL |
| Anita Desai | incomplete | GOLD | ₹15,000 | KYC incomplete testing |
| Vikram Singh | completed | BRONZE | ₹5,000 | Low credit tier testing |
| Meera Patel | completed | PLATINUM | ₹50,000 | High-value user |

### Merchants
| Name | BNPL Enabled | Category | Purpose |
|------|-------------|----------|---------|
| Flipkart Electronics | Yes | Electronics | Primary test merchant |
| Amazon Fashion | Yes | Fashion | Alternative BNPL merchant |
| Local Store | No | Retail | Merchant not eligible testing |
| Myntra | Yes | Fashion | Cross-sell for alt deals |

### Deals
| Deal | Merchant | Min Order Value | Discount |
|------|----------|----------------|----------|
| 50% off electronics | Flipkart | ₹8,000 | Up to ₹5,000 |
| Flat ₹2,000 off fashion | Amazon Fashion | ₹5,000 | ₹2,000 |
| 30% off everything | Local Store | ₹3,000 | Up to ₹1,500 |

## Demo Scenarios to Verify (from PRD Section 11.2)

After building, verify these 11 scenarios work end-to-end:

1. ✅ Happy path — Priya + Flipkart + ₹8,000 + success → APPROVED → SUCCESS
2. ✅ KYC incomplete — Anita + Flipkart + ₹5,000 → DECLINED: KYC_INCOMPLETE + KYC nudge
3. ✅ Low credit tier — Vikram + Flipkart + ₹5,000 → DECLINED: CREDIT_TIER_INSUFFICIENT
4. ✅ Cart exceeds limit — Rahul + Flipkart + ₹15,000 → DECLINED with partial BNPL (₹5K up + ₹10K EMI)
5. ✅ Merchant not eligible — Priya + Local Store + ₹5,000 → DECLINED: MERCHANT_NOT_ELIGIBLE
6. ✅ Velocity limit — Any user, 6th check in 1 hour → DECLINED: VELOCITY_LIMIT_EXCEEDED
7. ✅ Partner decline — Priya + Flipkart + ₹8,000 + decline → APPROVED → DECLINED
8. ✅ Transient failure + retry — Priya + Flipkart + ₹8,000 + transient → APPROVED → retry → SUCCESS
9. ✅ Timeout — Priya + Flipkart + ₹8,000 + timeout → APPROVED → TIMED_OUT
10. ✅ Duplicate callback — success + duplicate → SUCCESS, second logged as duplicate
11. ✅ Partial BNPL accepted — Rahul + Flipkart + ₹15,000 + success → split → SUCCESS for ₹10K
