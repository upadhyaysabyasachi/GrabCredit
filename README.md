# GrabCredit — BNPL Eligibility & Checkout (Explainable)

A prototype BNPL (Buy Now Pay Later) eligibility and checkout system for GrabOn's deal platform. Built as part of the GrabOn TPM Challenge 2025.

## What This Does

1. **Eligibility Engine** — Rules-based BNPL eligibility check with 5 risk signals, machine-readable reason codes, and actionable recovery options (including partial BNPL split payments).
2. **Checkout Orchestration** — State machine (INITIATED → PENDING → SUCCESS/DECLINED/FAILED/TIMED_OUT) with partner integration, retries, and idempotency.
3. **Mock Partner** — Simulates PayU/LazyPay with configurable behavior: success, decline, transient failure, timeout, duplicate callbacks.
4. **Three UI Surfaces** — Scenario Simulator (test harness), Consumer Checkout Experience, and Operator Dashboard.
5. **MCP Server** — Exposes `check_bnpl_eligibility` and `initiate_bnpl_checkout` as MCP tools.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+ / FastAPI |
| Frontend | Next.js 14 (App Router) / TypeScript / Tailwind CSS |
| Database | Supabase (Postgres) |
| MCP | Python / FastMCP |

## Quick Start

### 1. Supabase Setup

Create a Supabase project (or use an existing one). Then run:

```sql
-- In Supabase SQL Editor, run in order:
-- 1. sql/001_create_tables.sql
-- 2. sql/002_seed_data.sql
```

### 2. Environment

```bash
cp .env.example .env
# Fill in your Supabase URL and keys
```

### 3. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:3000
```

### 5. MCP Server

The MCP server exposes `check_bnpl_eligibility` and `initiate_bnpl_checkout` as [Model Context Protocol](https://modelcontextprotocol.io/) tools, enabling AI assistants (Claude Desktop, Claude Code, custom agents) to interact with the BNPL system programmatically.

**Note:** The backend (step 3) must be running for checkout functionality, as the MCP server delegates checkout dispatch to the backend's REST API.

#### Option A: Standalone (SSE transport)

```bash
cd backend
source .venv/bin/activate
python -m mcp_server.server --transport sse
# Runs on http://localhost:8001/sse
```

#### Option B: Claude Desktop integration (stdio transport)

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

Restart Claude Desktop. The tools will appear in Claude's tool list.

#### Option C: Claude Code CLI

```bash
claude mcp add grabcredit -- /path/to/grabcredit/backend/.venv/bin/python /path/to/grabcredit/backend/mcp_server/server.py
```

#### MCP Demo Script

Run the automated demo that connects as an MCP client and exercises 5 scenarios end-to-end:

```bash
cd backend
source .venv/bin/activate

# Start the MCP server in the background
python -m mcp_server.server --transport sse &

# Run the demo (backend must also be running on port 8000)
python demo_mcp.py
```

The demo covers: happy path, KYC decline with recovery, partial BNPL split, partner decline, and transient failure with retry.

#### MCP Tools Reference

| Tool | Description |
|------|-------------|
| `check_bnpl_eligibility` | Evaluate 5 rules (KYC, credit tier, cart limit, merchant, velocity) and return a structured decision with reason codes, risk signals, EMI terms, and recovery options. |
| `initiate_bnpl_checkout` | Initiate a BNPL checkout for an approved decision. Supports `partner_behavior` param for testing (success, decline, transient_failure, timeout, duplicate). |

## Eligibility Rules

Every eligibility check evaluates **all 5 rules** — no short-circuiting. A decision is APPROVED only if all pass. Each failure produces a machine-readable reason code and, where applicable, a recovery option.

| Rule | Signal | Pass Condition | On Fail | Recovery |
|------|--------|---------------|---------|----------|
| R1: KYC Status | `user.kyc_status` | Must be `completed` | `KYC_INCOMPLETE` | Inline KYC completion CTA |
| R2: Credit Tier | `user.credit_tier` | SILVER or above | `CREDIT_TIER_INSUFFICIENT` | Upgrade path guidance |
| R3: Cart Value | `cart_value` vs `user.max_bnpl_limit` | Cart ≤ limit | `CART_VALUE_EXCEEDS_LIMIT` | Partial BNPL split (only if sole failure) |
| R4: Merchant | `merchant.bnpl_enabled` | Must be `true` | `MERCHANT_NOT_ELIGIBLE` | Suggest alternative deals |
| R5: Velocity | Checks in last 60 min | Must be < 5 | `VELOCITY_LIMIT_EXCEEDED` | No recovery (abuse category) |

### Credit Tiers

Credit tiers represent a user's trust level within the BNPL system. In production, tiers would be derived from repayment history, transaction frequency, account age, and external credit signals. In the prototype, they are static attributes on each test user.

| Tier | BNPL Eligible | Represents | Test User | BNPL Limit |
|------|:------------:|------------|-----------|------------|
| PLATINUM | Yes | Highest trust — long history, high reliability | Meera Patel | ₹50,000 |
| GOLD | Yes | Good standing — established, clean record | Priya Sharma | ₹20,000 |
| SILVER | Yes | Minimum qualifying — newer but verified | Rahul Verma | ₹10,000 |
| BRONZE | No | Insufficient trust — too new or limited history | Vikram Singh | ₹5,000 |

The tier check (R2) and cart limit check (R3) are **separate rules** — a GOLD user with a ₹20K limit buying ₹25K of goods passes the tier check but fails the cart limit check, and is offered a partial BNPL split.

## Project Structure

```
grabcredit/
├── CLAUDE.md          # AI development instructions
├── README.md          # This file
├── .env.example       # Environment template
├── docs/              # Production handoff docs
│   ├── PRD.md         # Product Requirements Document
│   ├── API_CONTRACTS.md
│   ├── QA_PLAN.md
│   ├── OBSERVABILITY_PLAN.md
│   └── ROLLOUT_PLAN.md
├── sql/               # Database migrations
│   ├── 001_create_tables.sql
│   └── 002_seed_data.sql
├── backend/           # Python FastAPI
│   ├── main.py
│   ├── config.py
│   ├── models.py
│   ├── eligibility/
│   ├── checkout/
│   ├── partner/
│   ├── webhooks/
│   ├── api/
│   ├── mcp_server/
│   └── demo_mcp.py
└── frontend/          # Next.js
    └── src/
        ├── app/
        ├── components/
        ├── lib/
        └── hooks/
```

## Demo Scenarios

The prototype ships with 11 pre-built scenarios covering every code path. See `CLAUDE.md` or `docs/PRD.md` Section 11.2 for the full list.

## Live Demo

| Surface | URL |
|---------|-----|
| Frontend (Vercel) | https://grabcredit-frontend.vercel.app |
| Backend API (Render) | https://grabcredit-backend.onrender.com |
| MCP Server | Local only — see setup above |

## Documentation

- [Product Requirements Document](docs/PRD.md)
- [API Contracts](docs/API_CONTRACTS.md)
- [QA Plan](docs/QA_PLAN.md)
- [QA Test Results](docs/QA_TEST_RESULTS.md) — 41/41 tests passing
- [Observability Plan](docs/OBSERVABILITY_PLAN.md)
- [Rollout Plan](docs/ROLLOUT_PLAN.md)

## License

Confidential — GrabOn TPM Challenge Submission
