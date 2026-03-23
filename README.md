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

### 5. MCP Server (optional)

```bash
cd backend
python -m mcp.server
```

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
│   └── mcp/
└── frontend/          # Next.js
    └── src/
        ├── app/
        ├── components/
        ├── lib/
        └── hooks/
```

## Demo Scenarios

The prototype ships with 11 pre-built scenarios covering every code path. See `CLAUDE.md` or `docs/PRD.md` Section 11.2 for the full list.

## Documentation

- [Product Requirements Document](docs/PRD.md)
- [API Contracts](docs/API_CONTRACTS.md)
- [QA Plan](docs/QA_PLAN.md)
- [Observability Plan](docs/OBSERVABILITY_PLAN.md)
- [Rollout Plan](docs/ROLLOUT_PLAN.md)

## License

Confidential — GrabOn TPM Challenge Submission
