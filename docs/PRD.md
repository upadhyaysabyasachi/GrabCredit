# PRODUCT REQUIREMENTS DOCUMENT — GrabCredit

## BNPL Eligibility & Checkout (Explainable)

| Field | Value |
|-------|-------|
| **Author** | GrabOn Interview Assignment - GrabCredit |
| **Version** | 1.0 |
| **Date** | March 2026 |
| **Status** | DRAFT — Prototype |
| **Confidentiality** | CONFIDENTIAL |

---

## 1. Executive Summary

GrabCredit is GrabOn's future embedded finance vertical, bringing Buy Now Pay Later (BNPL) functionality directly into the deal redemption and checkout experience. This PRD defines the end-to-end system for BNPL eligibility decisioning, checkout orchestration, and partner callback handling.

The core product thesis is simple: when a user has found a great deal on GrabOn and is ready to redeem, offering a transparent, explainable BNPL option at checkout increases conversion while building trust through clarity. Every decision—approved or declined—must carry machine-readable reason codes and a full audit trail.

**Key constraint:** Trust is the core risk. A BNPL experience that feels opaque, fails silently, or handles edge cases poorly will erode user confidence and partner relationships. This system is designed for explainability, auditability, and resilience from day one.

---

## 2. Problem Statement

GrabOn currently facilitates deal discovery and redemption, but lacks any embedded financing capability at the point of highest user intent—checkout. Users who want a deal but lack immediate liquidity either abandon the cart or leave the platform to seek credit elsewhere.

### Problems We Solve

- **Cart abandonment due to affordability:** Users discover deals but drop off at payment when total exceeds their immediate budget.
- **Opaque credit decisions:** Existing BNPL products give a binary yes/no with no explanation, leading to frustration and distrust.
- **Fragile payment integrations:** Partner payment callbacks fail, arrive late, or arrive duplicated. Without resilient handling, users get stuck in limbo.
- **No operational visibility:** Without decision logs and checkout status tracking, ops teams cannot debug failures or audit decisions.

---

## 3. Objectives & Success Metrics

### Primary Objective

Deliver an end-to-end BNPL eligibility and checkout flow that is explainable, auditable, and resilient to partner integration failures.

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| BNPL eligibility check latency (p95) | < 500ms | Backend instrumentation |
| Checkout completion rate (of approved users) | > 70% | Funnel analytics |
| Decision explainability coverage | 100% of decisions have reason codes | Audit log completeness |
| Callback processing success rate | > 99.5% | Callback handler metrics |
| Duplicate callback dedup rate | 100% | Idempotency key checks |
| Mean time to detect checkout failure | < 30 seconds | Alerting pipeline |
| Operator dashboard load time | < 2 seconds | Frontend performance |

### Guardrails

- **BNPL approval rate must stay between 30–70%:** Too high signals under-filtering risk; too low signals the feature is not useful.
- **Zero untraced decisions:** Every eligibility decision must have a complete audit trail in the database.
- **No silent checkout failures:** Every failed checkout must produce a user-facing message and an operator-visible log entry.
- **Velocity limits enforced:** No user can trigger more than 5 eligibility checks in a 1-hour window.

---

## 4. Stakeholders

This section identifies the key stakeholders involved in the GrabCredit BNPL initiative, their roles, and their primary concerns.

| Stakeholder | Role | Primary Concerns | How They Interact with GrabCredit |
|-------------|------|-----------------|-----------------------------------|
| Consumer (End User) | The person redeeming a deal on GrabOn who may opt for BNPL at checkout. | Transparency of eligibility decisions, ease of checkout, clear communication on failures, data privacy. | Uses the checkout UI to check eligibility, view terms, and complete BNPL transactions. |
| Merchant | The business offering deals on GrabOn. Merchants opt in to accept BNPL as a payment method. | Increased conversion, timely settlement, low fraud exposure, minimal operational overhead. | Configured in the system as BNPL-eligible or not. Receives settlement (out of prototype scope). |
| GrabOn Product Team | Owns the GrabCredit product roadmap, defines success metrics, and makes go/no-go decisions on rollout. | Conversion uplift, user trust, approval rate balance, clean handoff to production. | Reviews metrics dashboards, defines kill/iterate/scale criteria, approves rule changes. |
| GrabOn Ops Team | Monitors day-to-day health of the BNPL system, investigates failures, handles escalations. | Operational visibility, fast debugging, clear audit trails, alerting on anomalies. | Uses the operator dashboard to view decision logs, checkout statuses, callback health, and failure events. |
| Payment Partner (PayU / LazyPay) | Provides the BNPL payment rails and underwriting infrastructure. Processes checkout transactions and sends callbacks. | Well-formed requests, idempotent integrations, timely callback acknowledgment, contract compliance. | Receives checkout initiation requests from GrabCredit, processes them, and sends status callbacks via webhook. |
| Lending Partner (Poonawalla Fincorp) | NBFC providing the lending license and credit underwriting framework for BNPL. | Regulatory compliance, risk exposure limits, audit requirements, portfolio health. | Defines credit policies and risk thresholds that feed into eligibility rules (out of prototype scope, but rules are designed to accommodate). |
| Engineering Team | Builds and maintains the GrabCredit system, from backend services to frontend experiences. | Clean architecture, testability, clear contracts, manageable tech debt, production-readiness. | Develops against the API contracts and schemas defined in this PRD. Uses the MCP tools for AI-assisted workflows. |
| Compliance / Legal | Ensures the BNPL product meets regulatory requirements (RBI guidelines, consumer protection, data privacy). | Transparent disclosures, proper KYC gating, audit trails, data retention policies. | Reviews reason code taxonomy, disclosure copy, and data handling practices (production scope). |

### 4.1 RACI Matrix (Key Decisions)

| Decision | Responsible | Accountable | Consulted | Informed |
|----------|-------------|-------------|-----------|----------|
| Eligibility rule thresholds | Engineering | Product Team | Lending Partner, Compliance | Ops Team |
| Checkout UX flow | Engineering | Product Team | Ops Team | Merchant |
| Partner contract schema | Engineering | Product Team | Payment Partner | Compliance |
| Rollout gating (% traffic) | Product Team | Product Team | Ops Team, Engineering | Merchant |
| Kill/iterate/scale decision | Product Team | Product Team | Ops Team, Engineering, Compliance | Lending Partner |
| Incident response (checkout failures) | Ops Team | Engineering | Payment Partner | Product Team |
| Reason code taxonomy updates | Product Team | Product Team | Compliance, Engineering | Ops Team |

---

## 5. User Stories

User stories are organized by persona. Each story includes acceptance criteria that map directly to implementation requirements.

### 5.1 Consumer (End User)

**US-01: Check BNPL eligibility at checkout**

*As a **consumer at checkout**, I want to **see whether I qualify for BNPL** so that **I can decide whether to split my payment before committing.***

**Acceptance Criteria:**
- Given a valid cart with a BNPL-eligible merchant, when the user clicks "Check BNPL", the system returns an eligibility decision within 500ms.
- The decision is either APPROVED (with EMI terms preview) or DECLINED (with a human-readable reason).
- If the user is declined, the reason is specific: "Cart value exceeds your current limit of ₹10,000" rather than a generic "not eligible."
- The decision is persisted with full context (user, merchant, cart, risk signals, timestamp) in the audit log.

---

**US-02: Complete a BNPL checkout**

*As a **consumer who has been approved**, I want to **complete the BNPL checkout in one flow** so that **I don't have to re-enter information or navigate away from GrabOn.***

**Acceptance Criteria:**
- After approval, the user sees a "Confirm BNPL" button with EMI breakdown (amount, tenure, interest if any).
- Clicking confirm initiates the checkout via the partner (PayU/LazyPay mock) and shows a "Processing" state.
- On success, the user sees a confirmation with order ID and repayment summary.
- On decline from partner, the user sees a clear message and option to pay via other methods.

---

**US-03: Understand why I was declined**

*As a **consumer who was declined**, I want to **understand the specific reason** so that **I know what to do differently next time.***

**Acceptance Criteria:**
- Decline reasons are mapped to user-friendly messages from a controlled taxonomy.
- The UI shows actionable guidance where possible: "Complete KYC verification to unlock BNPL" or "Try a smaller cart value."
- The system never exposes internal risk scores or model internals to the consumer.

---

**US-04: Recover from a payment failure**

*As a **consumer whose checkout failed**, I want to **see a clear error and retry or choose another payment method** so that **I'm not stuck in a broken state.***

**Acceptance Criteria:**
- If the partner returns a transient error, the system retries automatically (up to 2 retries with exponential backoff).
- If retries exhaust, the user sees "Payment could not be processed. Please try again or choose another method."
- The checkout state transitions to FAILED and is visible in the operator dashboard.
- The user can retry the entire flow without re-checking eligibility (cached decision valid for 15 minutes).

---

**US-05: Rate-limited if checking too frequently**

*As the **system**, I want to **enforce velocity limits on eligibility checks** so that **abuse and gaming are prevented.***

**Acceptance Criteria:**
- A user is limited to 5 eligibility checks per rolling 1-hour window.
- On the 6th attempt, the system returns a `VELOCITY_LIMIT_EXCEEDED` reason code without evaluating other rules.
- The rate limit event is logged for fraud analysis.

---

**US-06: See actionable recovery options when declined**

*As a **consumer who was declined for BNPL**, I want to **see specific actions I can take to become eligible or an alternative payment arrangement** so that **I'm not left at a dead end and can still complete my purchase.***

**Acceptance Criteria:**
- When a decision is DECLINED, the response includes a `recovery_options` array with zero or more actionable alternatives.
- For `CART_VALUE_EXCEEDS_LIMIT`: the system calculates a partial BNPL option showing upfront amount and BNPL amount with EMI terms.
- For `KYC_INCOMPLETE`: the system returns a recovery option with a direct link/CTA to the KYC verification flow.
- For `CREDIT_TIER_INSUFFICIENT`: the system returns guidance on how to build trust level (e.g., "Complete 3 more transactions to unlock BNPL").
- For `MERCHANT_NOT_ELIGIBLE`: the system optionally suggests similar deals from BNPL-enabled merchants.
- Recovery options are never shown for abuse-category declines (`VELOCITY_LIMIT_EXCEEDED`).
- All recovery options shown are logged in the decision audit trail for analysis.

---

**US-07: Use partial BNPL (split payment) when cart exceeds limit**

*As a **consumer whose cart exceeds my BNPL limit**, I want to **pay the excess amount upfront and use BNPL for the remainder** so that **I can still benefit from BNPL without reducing my cart.***

**Acceptance Criteria:**
- When `CART_VALUE_EXCEEDS_LIMIT` is the only failing rule, the system automatically calculates: `upfront_amount = cart_value − user.max_bnpl_limit`, `bnpl_amount = user.max_bnpl_limit`.
- The recovery option includes full EMI terms for the BNPL portion (tenure options, monthly amount, interest rate).
- The user can accept the split payment option, which initiates a checkout for the BNPL portion only.
- The upfront payment is handled separately (out of BNPL scope; merchant collects directly).
- If the user has multiple failing rules (e.g., `KYC_INCOMPLETE` + `CART_VALUE_EXCEEDS_LIMIT`), the partial BNPL option is not offered until other blockers are resolved.
- The split payment decision is persisted as a distinct checkout attempt linked to the original eligibility decision.

---

### 5.2 Operator (Internal Ops Team)

**US-08: View decision audit logs**

*As an **ops team member**, I want to **view all eligibility decisions with full context** so that **I can audit decisions, debug complaints, and identify patterns.***

**Acceptance Criteria:**
- The operator dashboard displays a searchable, filterable list of all eligibility decisions.
- Each decision row shows: timestamp, user ID, merchant, cart value, decision (approved/declined), and reason codes.
- Clicking a decision expands to show the full risk signal breakdown and checkout attempt history.

---

**US-09: Monitor checkout health**

*As an **ops team member**, I want to **see real-time checkout status and failure rates** so that **I can detect partner outages and escalate quickly.***

**Acceptance Criteria:**
- Dashboard shows checkout attempts by status: PENDING, SUCCESS, DECLINED, FAILED, TIMED_OUT.
- Failure rate over the last 1 hour is prominently displayed with a threshold indicator (green/yellow/red).
- Individual failed checkouts show the error type and whether retry was attempted.

---

**US-10: Investigate duplicate callbacks**

*As an **ops team member**, I want to **see when duplicate partner callbacks were received and safely ignored** so that **I can verify the idempotency layer is working correctly.***

**Acceptance Criteria:**
- Callback logs show all received callbacks, with a "duplicate" flag on duplicates.
- The original and duplicate callbacks are linkable by idempotency key.
- Dashboard shows a duplicate callback count metric.

---

### 5.3 Partner Integration (PayU / LazyPay)

**US-11: Receive well-formed checkout requests**

*As the **payment partner**, I expect to **receive idempotent, well-structured checkout requests** so that **duplicate processing is prevented on my side.***

**Acceptance Criteria:**
- Every checkout request carries a unique `idempotency_key`.
- Request payload conforms to a documented JSON schema with all required fields.
- Duplicate requests (same `idempotency_key`) return the original response, not a new transaction.

---

**US-12: Send callbacks reliably**

*As the **payment partner**, I expect that **my callback endpoint is available and acknowledges receipt** so that **I don't need to keep retrying indefinitely.***

**Acceptance Criteria:**
- GrabCredit's webhook endpoint returns 200 OK within 5 seconds for valid callbacks.
- Invalid payloads (wrong schema, unknown checkout ID) return 400 with a structured error.
- The endpoint is idempotent: receiving the same callback twice has no side effect.

---

## 6. Scope & Non-Goals

### 6.1 In Scope (Prototype)

- Rules-based BNPL eligibility engine with 5 risk signals and machine-readable reason codes.
- Checkout orchestration with state machine (INITIATED → PENDING → SUCCESS | DECLINED | FAILED | TIMED_OUT).
- Mock PayU/LazyPay partner that simulates success, decline, transient failure, and delayed callbacks.
- Webhook callback handler with idempotency, retry tracking, and duplicate detection.
- Next.js checkout UI showing eligibility check, approval/decline, checkout progress, and result.
- Operator dashboard with decision logs, checkout status view, and failure event monitoring.
- MCP server exposing `check_bnpl_eligibility` and `initiate_bnpl_checkout` tools.
- Supabase-backed persistence for all decisions, checkout states, and callback logs.
- One basic velocity check (5 checks per user per hour).
- Recovery options on decline (partial BNPL split payment, KYC nudge, upgrade path).
- Scenario Simulator (test harness) for evaluator to input checkout scenarios and control mock partner behavior.

### 6.2 Non-Goals (Prototype)

- Real payment partner integration (mock is sufficient).
- ML-based credit scoring model (rules-based is sufficient and the brief confirms this).
- User authentication and session management (assumed; use test user IDs).
- Mobile-responsive UI (desktop-only for prototype).
- Multi-tenant or multi-merchant admin portal.
- EMI calculation engine (prototype uses a simplified flat-rate formula: `monthly_emi = (amount * (1 + rate * tenure_months / 12)) / tenure_months` with a fixed 1.5% monthly rate. This is explicitly not production-grade; a real implementation would use reducing balance method, include GST on interest, and comply with RBI fair practices code).
- Regulatory compliance filing (KYC/AML integrations are out of scope but noted in production handoff).

---

## 7. Eligibility Decision Engine

The eligibility engine evaluates a checkout context against a set of deterministic rules. Each rule produces a PASS or FAIL signal. The overall decision is APPROVED only if all rules pass. Each failure produces a specific reason code.

### 7.1 Risk Signal Taxonomy

| Rule | Signal | Reason Code (on fail) | Description |
|------|--------|----------------------|-------------|
| R1: KYC Status | `user.kyc_status` | `KYC_INCOMPLETE` | User must have completed KYC verification. |
| R2: Credit Tier | `user.credit_tier` | `CREDIT_TIER_INSUFFICIENT` | User's credit tier must be SILVER or above (SILVER, GOLD, PLATINUM). |
| R3: Cart Value Limit | `cart.total` vs `user.max_bnpl_limit` | `CART_VALUE_EXCEEDS_LIMIT` | Cart total must not exceed user's approved BNPL limit. |
| R4: Merchant Eligibility | `merchant.bnpl_enabled` | `MERCHANT_NOT_ELIGIBLE` | Merchant must be enrolled in the BNPL program. |
| R5: Velocity Check | `checks_in_last_hour` | `VELOCITY_LIMIT_EXCEEDED` | User must have fewer than 5 checks in the rolling 1-hour window. |

**Velocity Semantics:**
- ALL eligibility checks count toward the velocity limit, including checks that result in DECLINED.
- The velocity event is recorded BEFORE rules evaluation (so the current check itself counts toward the window).
- Exception: a recovery re-check after KYC completion bypasses velocity tracking when the request includes a `prior_decision_id` that was declined solely for `KYC_INCOMPLETE` and the user's KYC status has since changed to `completed`. This bypass is logged with `event_type = 'eligibility_check_recovery'`.

### 7.2 Decision Object Schema

Every eligibility check produces a structured decision object that is persisted in full. The schema is designed to be both machine-readable (for downstream systems) and human-auditable (for ops).

| Field | Type | Description |
|-------|------|-------------|
| `decision_id` | UUID | Unique identifier for this decision. |
| `user_id` | UUID | The user being evaluated. |
| `merchant_id` | UUID | The merchant context. |
| `cart_value` | Decimal | Total cart value in INR. |
| `decision` | Enum: `APPROVED` \| `DECLINED` | The outcome. |
| `reason_codes` | Array\<String\> | List of failed rule codes (empty if approved). |
| `risk_signals` | JSON | Full breakdown of each rule's input and result. |
| `emi_terms` | JSON \| null | If approved: suggested tenure, EMI amount, interest rate. |
| `recovery_options` | Array\<JSON\> \| null | If declined: actionable alternatives (partial BNPL, KYC nudge, etc.) with type, amounts, message, and CTA. |
| `expires_at` | Timestamp | Decision validity window (15 minutes from creation). |
| `created_at` | Timestamp | When the decision was made. |

---

## 8. Checkout State Machine

Each checkout attempt follows a strict state machine. Transitions are unidirectional and every transition is logged with a timestamp and trigger source.

| State | Description | Trigger |
|-------|-------------|---------|
| `INITIATED` | Checkout request created, about to call partner. | User clicks "Confirm BNPL" |
| `PENDING` | Partner request sent, awaiting callback. | Partner returns acknowledgment |
| `SUCCESS` | Payment confirmed by partner callback. | Partner callback: status=success |
| `DECLINED` | Partner declined the transaction. | Partner callback: status=declined |
| `FAILED` | Transient error, retries exhausted. | 3 consecutive partner errors |
| `TIMED_OUT` | No callback received within 5 minutes. | Timeout job triggers |

### 8.1 Valid Transitions

`INITIATED → PENDING → SUCCESS | DECLINED | FAILED`. Additionally: `PENDING → TIMED_OUT` (after 5 minutes with no callback). No backward transitions are permitted. A checkout in a terminal state (SUCCESS, DECLINED, FAILED, TIMED_OUT) cannot be modified.

### 8.2 Idempotency Strategy

- Each checkout attempt is assigned a unique `idempotency_key` (format: `grabcredit_{decision_id}_{timestamp_ms}`).
- The partner receives this key. If GrabCredit retries (transient failure), the same key is reused.
- On the callback side, we track processed idempotency keys. Duplicate callbacks are logged but not re-processed.
- The `callback_logs` table stores every raw callback payload, with a "duplicate" boolean and a pointer to the original.

### 8.3 Partial BNPL (Split Payment) Flow

When a user is declined solely due to `CART_VALUE_EXCEEDS_LIMIT`, the system offers a split payment alternative. This converts a decline into a potential transaction by allowing the user to pay the excess upfront and finance the remainder via BNPL.

**How it works:**

1. Eligibility engine detects `CART_VALUE_EXCEEDS_LIMIT` as the only failing rule.
2. System calculates: `upfront_amount = cart_value − user.max_bnpl_limit`; `bnpl_amount = user.max_bnpl_limit`.
3. EMI terms are computed for the BNPL portion only (same tenure options: 3, 6, 9, 12 months).
4. Decision response includes a `PARTIAL_BNPL` recovery option with `upfront_amount`, `bnpl_amount`, and `emi_terms`.
5. If user accepts, a new checkout is initiated for the BNPL portion. The upfront amount is collected separately by the merchant.
6. The checkout follows the same state machine (INITIATED → PENDING → terminal state) and is linked to the original decision via `decision_id`.

**Recovery Option Object Schema (within decision response):**

| Field | Type | Description |
|-------|------|-------------|
| `type` | Enum: `PARTIAL_BNPL` \| `INLINE_KYC` \| `UPGRADE_PATH` \| `ALT_DEALS` | The category of recovery action. |
| `upfront_amount` | Decimal \| null | Amount user pays upfront (PARTIAL_BNPL only). |
| `bnpl_amount` | Decimal \| null | Amount financed via BNPL (PARTIAL_BNPL only). |
| `emi_terms` | JSON \| null | EMI breakdown for the BNPL portion (PARTIAL_BNPL only). |
| `message` | String | User-facing description of the recovery option. |
| `cta_label` | String | Button/link text (e.g., "Pay ₹5,000 now + EMI" or "Complete KYC"). |
| `cta_action` | String | Action identifier for the frontend (e.g., `initiate_split_checkout`, `open_kyc_flow`). |

**Constraints:**
- Partial BNPL is only offered when `CART_VALUE_EXCEEDS_LIMIT` is the sole failing rule. If other rules also fail (e.g., `KYC_INCOMPLETE`), those must be resolved first.
- The minimum upfront amount is ₹100 (avoid trivial splits).
- Recovery options are never offered for abuse-category declines (`VELOCITY_LIMIT_EXCEEDED`).
- All recovery options shown and accepted are logged in the audit trail for conversion analysis.

### 8.4 Timeout Mechanism

A background async task runs every 30 seconds to detect stale checkouts and transition them to `TIMED_OUT`.

**Implementation:**
- Query: `SELECT id FROM checkout_attempts WHERE status = 'PENDING' AND created_at < now() - interval '5 minutes'`
- Transition: `UPDATE checkout_attempts SET status = 'TIMED_OUT' WHERE id = {id} AND status = 'PENDING' RETURNING id`
- The `WHERE status = 'PENDING'` clause in the UPDATE handles the race condition: if a callback arrives and transitions the checkout to SUCCESS at the same moment the timeout job runs, whichever executes the UPDATE first wins. The loser sees zero rows affected and logs accordingly.

**Late callback handling:**
- If a callback arrives for a checkout already in `TIMED_OUT` (or any terminal state), the callback is logged in `callback_logs` with `is_late = true` but the checkout state is NOT changed. Terminal states are immutable per §8.1.
- The operator dashboard surfaces late callbacks for investigation.

### 8.5 Decision Expiration & Recovery

- A decision that has passed its `expires_at` timestamp cannot be used for checkout initiation. The API returns `DECISION_EXPIRED`.
- Recovery actions (completing KYC, accepting partial BNPL) that occur after the decision has expired require a fresh eligibility check.
- The fresh re-check counts as a velocity event, EXCEPT for KYC recovery (see velocity semantics in §7.1).
- If a user accepts a recovery option within the 15-minute validity window, the original `decision_id` is reused for the checkout attempt.

---

## 9. Partner Integration Contract

This section defines the request/response contracts between GrabCredit and the payment partner (PayU/LazyPay). In the prototype, these are implemented as a mock partner service. The contracts are designed to be production-ready.

### 9.1 Initiate Checkout (GrabCredit → Partner)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `idempotency_key` | String | Yes | Unique key for deduplication. |
| `user_id` | UUID | Yes | GrabOn user identifier. |
| `merchant_id` | UUID | Yes | GrabOn merchant identifier. |
| `amount` | Decimal | Yes | Transaction amount in INR. |
| `currency` | String | Yes | Always "INR" for prototype. |
| `emi_tenure_months` | Integer | Yes | Selected EMI tenure (3, 6, 9, 12). |
| `callback_url` | URL | Yes | GrabCredit's webhook endpoint. |
| `metadata` | JSON | No | Opaque context passed through. |

### 9.2 Partner Callback (Partner → GrabCredit)

| Field | Type | Description |
|-------|------|-------------|
| `idempotency_key` | String | Matches the original request. |
| `partner_ref` | String | Partner's transaction reference ID. |
| `status` | Enum: `success` \| `declined` \| `error` | Final transaction status. |
| `decline_reason` | String \| null | Partner's decline reason (if declined). |
| `error_code` | String \| null | Partner's error code (if error). |
| `timestamp` | ISO 8601 | When the partner processed this. |

### 9.3 Retry & Error Handling

| Scenario | Behavior |
|----------|----------|
| Partner returns HTTP 5xx | Retry with exponential backoff: 1s, 2s, 4s. Max 3 attempts. Same idempotency_key. |
| Partner returns HTTP 4xx | Do not retry. Mark checkout as FAILED. Log error. |
| Partner timeout (no response in 10s) | Treat as transient. Retry up to 3 times. |
| Callback not received in 5 minutes | Transition checkout to TIMED_OUT. Alert ops. |
| Duplicate callback received | Log as duplicate. Return 200 OK. No state change. |
| Callback for unknown checkout ID | Log as orphan. Return 400. |

### 9.4 Webhook Security

| Aspect | Prototype | Production |
|--------|-----------|------------|
| Authentication | None (localhost loopback, mock partner only) | HMAC-SHA256 signature verification |
| Signature header | N/A | `X-Partner-Signature: HMAC-SHA256={signature}` |
| Signing payload | N/A | `{timestamp}.{request_body}` signed with shared secret |
| IP allowlist | N/A | Restrict to partner's known IP ranges |
| Rate limiting | None | Max 100 callbacks/minute per checkout_id; 1,000/minute globally |
| Replay protection | Idempotency key deduplication | Idempotency + timestamp validation (reject callbacks > 5 minutes old) |

The webhook handler architecture supports plugging in signature verification via a middleware layer. In the prototype, this middleware is a pass-through. In production, it validates the `X-Partner-Signature` header before the payload reaches the callback handler.

---

## 10. Reason Code Taxonomy

All reason codes follow a consistent naming convention: `{CATEGORY}_{SPECIFIC_REASON}`. Each code maps to a machine-readable identifier, a user-friendly message template, and a recovery action where applicable.

| Code | Category | User-Facing Message | Recovery Action |
|------|----------|-------------------|----------------|
| `KYC_INCOMPLETE` | Eligibility | Complete your KYC verification to unlock BNPL. | `INLINE_KYC`: Show CTA to KYC flow. On completion, re-check without velocity penalty. |
| `CREDIT_TIER_INSUFFICIENT` | Eligibility | Your account needs a higher trust level for BNPL. | `UPGRADE_PATH`: Show progress toward next tier (e.g., "3 more transactions to unlock"). |
| `CART_VALUE_EXCEEDS_LIMIT` | Eligibility | Your BNPL limit is ₹{limit}. Try a smaller cart. | `PARTIAL_BNPL`: Calculate split — upfront_amount + bnpl_amount with EMI terms. Offer as alternative. |
| `MERCHANT_NOT_ELIGIBLE` | Eligibility | BNPL is not available for this merchant yet. | `ALT_DEALS`: Suggest similar BNPL-enabled merchant deals (optional). |
| `VELOCITY_LIMIT_EXCEEDED` | Abuse | Too many checks recently. Try again in {minutes} minutes. | `NONE`: No recovery offered. Show countdown timer only. |
| `PARTNER_DECLINED` | Checkout | The payment could not be approved. Try another method. | `ALT_PAYMENT`: Surface alternative payment methods. |
| `PARTNER_ERROR` | Checkout | A temporary error occurred. We're retrying. | `AUTO_RETRY`: System retries automatically. No user action needed. |
| `PARTNER_TIMEOUT` | Checkout | Payment confirmation delayed. We'll update you. | `STATUS_POLL`: Frontend polls for updates. Show status page. |
| `CHECKOUT_EXPIRED` | Checkout | This checkout session expired. Please start again. | `RESTART`: Re-initiate eligibility check (free of velocity penalty). |

---

## 11. Prototype User Flow & Demonstration Strategy

The brief requires two specific demonstration capabilities: (1) input a checkout scenario and produce an eligibility decision with reason codes, and (2) simulate a BNPL checkout that can return success, decline, and transient failure. This shapes the prototype into three distinct surfaces.

### 11.1 Three Surfaces

#### Surface 1: Scenario Simulator (Test Harness)

The primary demonstration tool. An evaluator-facing UI where the user constructs a checkout scenario by selecting inputs and observing the full system response. This directly addresses the brief's requirement to "input a checkout scenario."

**Inputs the evaluator configures:**
- **User profile:** Select from pre-seeded test users with varying attributes (KYC complete/incomplete, credit tier BRONZE through PLATINUM, different BNPL limits).
- **Merchant:** Select from pre-seeded merchants (BNPL-enabled and not-enabled, different categories).
- **Cart value:** Adjustable numeric input (in INR). Pre-fills from deal context but can be overridden.
- **Mock partner behavior:** Dropdown to force the partner response — success, decline, transient failure (5xx), or timeout. This lets the evaluator trigger every code path.

**What the evaluator sees after running a scenario:**
- Full eligibility decision object: decision (APPROVED/DECLINED), reason codes, risk signal breakdown for each of the 5 rules, EMI terms (if approved), and recovery options (if declined).
- If the evaluator proceeds to checkout: real-time state machine transitions (INITIATED → PENDING → terminal state), retry attempts (if transient failure was selected), and final callback payload.
- Raw JSON view of every API request and response for full transparency.

#### Surface 2: Consumer Checkout Experience

A simulated consumer-facing checkout page that demonstrates what a real user would see. This surface uses the same backend APIs as the Scenario Simulator but presents a polished product experience rather than a test harness.

**Flow:**
1. User lands on a simulated deal page (e.g., "50% off electronics at Flipkart — orders above ₹8,000").
2. Cart value is pre-filled from the deal's minimum order value. User can adjust it.
3. User clicks "Check BNPL Eligibility" → sees APPROVED with EMI terms, or DECLINED with specific reason and recovery options (e.g., partial BNPL split, KYC nudge).
4. If approved (or partial BNPL accepted): user clicks "Confirm BNPL" → processing spinner → success/failure result with order ID and repayment summary.
5. On failure: clear error message with retry option or alternative payment nudge.

#### Surface 3: Operator Dashboard

An internal ops view showing the audit trail and system health across all scenarios. Described in detail under User Stories US-08 through US-10.

**Key views:**
- **Decision Logs:** Searchable list of all eligibility decisions with expandable detail (risk signals, recovery options offered, checkout history).
- **Checkout Status:** All checkout attempts by state, with failure rate indicator and retry tracking.
- **Callback Logs:** Every partner callback received, with duplicate detection flag and linkage to original.

### 11.2 Demonstration Scenarios (Pre-Built)

The prototype ships with pre-seeded data and recommended scenarios that together cover every code path:

| Scenario | User Profile | Merchant | Cart Value | Mock Partner | Expected Outcome |
|----------|-------------|----------|-----------|-------------|-----------------|
| Happy path | KYC complete, GOLD tier, ₹20K limit | BNPL-enabled | ₹8,000 | Success | APPROVED → Checkout SUCCESS |
| KYC incomplete | KYC incomplete, GOLD tier | BNPL-enabled | ₹5,000 | N/A | DECLINED: KYC_INCOMPLETE with KYC nudge |
| Low credit tier | KYC complete, BRONZE tier | BNPL-enabled | ₹5,000 | N/A | DECLINED: CREDIT_TIER_INSUFFICIENT with upgrade path |
| Cart exceeds limit | KYC complete, SILVER tier, ₹10K limit | BNPL-enabled | ₹15,000 | N/A | DECLINED: CART_VALUE_EXCEEDS_LIMIT with partial BNPL option (₹5K upfront + ₹10K EMI) |
| Merchant not eligible | KYC complete, GOLD tier | BNPL not enabled | ₹5,000 | N/A | DECLINED: MERCHANT_NOT_ELIGIBLE |
| Velocity limit hit | Any user, 5+ checks in 1hr | BNPL-enabled | Any | N/A | DECLINED: VELOCITY_LIMIT_EXCEEDED |
| Partner decline | KYC complete, GOLD tier, ₹20K limit | BNPL-enabled | ₹8,000 | Decline | APPROVED → Checkout DECLINED by partner |
| Transient failure + retry | KYC complete, GOLD tier, ₹20K limit | BNPL-enabled | ₹8,000 | 5xx then success | APPROVED → INITIATED → PENDING (retry) → SUCCESS |
| Timeout | KYC complete, GOLD tier, ₹20K limit | BNPL-enabled | ₹8,000 | Timeout | APPROVED → INITIATED → PENDING → TIMED_OUT |
| Duplicate callback | KYC complete, GOLD tier | BNPL-enabled | ₹8,000 | Success + duplicate | Checkout SUCCESS. Second callback logged as duplicate, no state change. |
| Partial BNPL accepted | KYC complete, SILVER tier, ₹10K limit | BNPL-enabled | ₹15,000 | Success | DECLINED with partial BNPL → user accepts → Checkout SUCCESS for ₹10K |

### 11.3 Cart Value Sourcing

Since GrabOn is a deal discovery platform and does not own the merchant checkout, the prototype uses a hybrid approach for cart value:

- **Deal metadata as default:** Each deal in the system has a minimum order value or deal ceiling. This is pre-filled as the estimated cart value when the user selects a deal.
- **User-adjustable input:** The user can override the pre-filled cart value. The eligibility result carries a note: "Based on your estimated cart of ₹{value}."
- **Scenario Simulator override:** In the test harness, the evaluator can set any cart value directly, bypassing deal context entirely.
- **Production path (noted for handoff):** In production, a merchant-embedded widget or SDK would pass the real cart value from the merchant's checkout page, eliminating estimation entirely.

---

## 12. Architecture Overview

The system follows a layered architecture with clear separation between the consumer-facing checkout flow, the eligibility decision engine, the checkout orchestrator, and the partner integration layer.

### 12.1 Components

| Component | Technology | Responsibility |
|-----------|-----------|---------------|
| Scenario Simulator | Next.js | Evaluator-facing test harness: configure user/merchant/cart/partner behavior, run scenarios, view full decision and checkout trace. |
| Checkout UI | Next.js | Consumer-facing checkout experience: deal page, eligibility check, approval/decline with recovery options, checkout flow, result. |
| Operator Dashboard | Next.js | Internal ops view: decision logs, checkout statuses, callback logs, health metrics. |
| API Layer | Python (FastAPI) | REST endpoints for eligibility checks, checkout initiation, callback handling, and dashboard data. |
| Eligibility Engine | Python | Rules evaluation, reason code generation, recovery option calculation, decision persistence. |
| Checkout Orchestrator | Python | State machine management, partner request dispatch, retry logic, timeout handling. |
| Mock Partner Service | Python | Simulates PayU/LazyPay: accepts checkout requests, sends callbacks with configurable behavior (success, decline, 5xx, timeout, duplicate). |
| MCP Server | Python (FastMCP) | Exposes `check_bnpl_eligibility` and `initiate_bnpl_checkout` as MCP tools. |
| Database | Supabase (Postgres) | Persistent store for users, merchants, decisions, checkouts, and callback logs. |

### 12.2 Data Flow

1. User clicks "Check BNPL Eligibility" → Next.js calls `POST /api/eligibility/check`
2. FastAPI evaluates all 5 rules → persists decision to Supabase → returns structured decision to frontend.
3. If approved, user clicks "Confirm BNPL" → Next.js calls `POST /api/checkout/initiate`
4. FastAPI creates checkout record (INITIATED), calls mock partner, transitions to PENDING.
5. Mock partner processes and sends callback to `POST /api/webhook/partner-callback`
6. Callback handler: validates payload, checks idempotency, transitions checkout state, logs everything.
7. Frontend polls checkout status and displays final result to user.

---

## 13. Database Schema (Supabase)

| Table | Key Fields | Purpose |
|-------|-----------|---------|
| `users` | id, name, email, kyc_status, credit_tier, max_bnpl_limit, created_at | User profiles with credit attributes. |
| `merchants` | id, name, category, bnpl_enabled, max_cart_value, created_at | Merchant configuration. |
| `eligibility_decisions` | id, user_id, merchant_id, cart_value, decision, reason_codes[], risk_signals (JSONB), emi_terms (JSONB), recovery_options (JSONB), expires_at, created_at | Full audit log of every eligibility check. |
| `checkout_attempts` | id, decision_id, idempotency_key (UNIQUE), status, partner_ref, error_detail, retry_count, created_at, updated_at | State machine record for each checkout. |
| `callback_logs` | id, checkout_id, idempotency_key, raw_payload (JSONB), is_duplicate, processed_at, created_at | Raw log of every partner callback. |
| `velocity_events` | id, user_id, event_type, created_at | Tracks eligibility check events for rate limiting. |

---

## 14. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Partner callback delivery is unreliable (delays, duplicates, drops) | High | Idempotency keys on all callbacks. Timeout job promotes PENDING to TIMED_OUT after 5 min. Ops alerting on callback failure rate. |
| Eligibility rules are too restrictive (low approval rate) | Medium | Monitor approval rate. Guardrail: if rate drops below 30%, trigger review. Rules are configurable without code deploy. |
| User perceives decisions as unfair or opaque | High | Every decision carries human-readable reason codes with actionable guidance. No black-box scoring in prototype. |
| Velocity check is too aggressive for legitimate users | Low | Start with 5/hour. Monitor false positive rate. Make threshold configurable per user tier. |
| Mock partner diverges from real partner behavior | Medium | Document all assumptions. Mock covers: success, decline, 5xx error, timeout, duplicate callback. Production handoff includes real partner contract validation checklist. |
| Database becomes bottleneck under load | Low (prototype) | Supabase Postgres with proper indexing. Production: read replicas for dashboard, connection pooling, partitioning on created_at. |

---

## 15. Kill / Iterate / Scale Criteria

After the initial rollout (1% → 5% → 25% → 100% of eligible traffic), the team evaluates against these criteria weekly:

### Kill Criteria (Stop and Re-evaluate)

- BNPL approval rate drops below 20% for 3 consecutive days.
- Checkout failure rate exceeds 10% for 2 consecutive days.
- Partner callback success rate drops below 95%.
- User complaints about unclear decisions exceed 5% of BNPL users.

### Iterate Criteria (Adjust and Continue)

- Approval rate is between 20–30% (rules may be too strict).
- Checkout completion rate is below 60% of approved users (UX friction).
- Callback duplicate rate exceeds 5% (partner integration issue).

### Scale Criteria (Expand Rollout)

- Approval rate is 30–70% and stable for 7 days.
- Checkout completion rate exceeds 70% of approved users.
- Zero untraced decisions and zero silent failures for 7 days.
- Operator dashboard is actively used by ops team for daily monitoring.

---

## 16. Prototype vs. Production Readiness

This table summarizes what the prototype implements versus what a production deployment requires. Each row represents a conscious scope decision — the prototype validates the architecture and business logic, while the production column defines the path to launch-readiness.

| Aspect | Prototype Implementation | Production Requirement |
|--------|-------------------------|----------------------|
| Partner integration | Mock partner with configurable behavior (success, decline, transient, timeout, duplicate) | Real PayU/LazyPay sandbox → production credentials. Contract validation and end-to-end testing. |
| Webhook security | No authentication (localhost loopback, mock partner only) | HMAC-SHA256 signature verification, IP allowlist, replay protection (see §9.4) |
| Timeout job | In-process async loop within FastAPI (every 30 seconds) | Separate worker process with distributed lock (Redis/pg_advisory_lock) to prevent duplicate transitions |
| EMI calculation | Flat-rate mock formula (1.5% monthly, simplified) | Reducing balance method, GST on interest, RBI fair practices code compliance |
| KYC verification | Toggle endpoint in simulator (flip completed ↔ incomplete) | Real eKYC provider integration (Digilocker, PAN verification, video KYC) |
| Authentication | Test user IDs selected from dropdown, no sessions | OAuth 2.0 + JWT session management with secure token handling |
| Rate limiting | Database-based velocity check (query velocity_events table) | Redis-backed sliding window with sub-millisecond lookups at scale |
| Circuit breaker | None (mock partner is always reachable) | Resilience pattern (tenacity/Resilience4j) with half-open state for partner calls |
| Feature flags | Config value, always enabled | Feature flag service (LaunchDarkly/Unleash) with percentage-based targeting |
| Observability | Python logging + operator dashboard | OpenTelemetry → Datadog/Grafana, PagerDuty alerts (see OBSERVABILITY_PLAN.md) |
| Data retention | Indefinite (development database) | Tiered retention: callback_logs 90 days, velocity_events 7 days, decisions 1 year (see §16.1) |
| Load testing | Manual scenario testing (11 scenarios) | Automated load testing validating 10K+ concurrent eligibility checks |

### 16.1 Data Retention Policy (Production)

| Data | Retention | Rationale |
|------|-----------|-----------|
| `eligibility_decisions` | 1 year | Audit compliance, dispute resolution |
| `checkout_attempts` | 1 year | Transaction history, reconciliation |
| `callback_logs` | 90 days (then archived) | Operational debugging, partner reconciliation |
| `velocity_events` | 7 days | Only 1 hour needed for rule, 7 days for analytics |
| Idempotency key cache | 24 hours in Redis, backed by DB for full history | Fast duplicate detection for recent callbacks |

In the prototype, no retention limits apply — all data is kept indefinitely in the development Supabase instance.

---

## 17. Future Considerations (Post-Prototype)

These items are explicitly out of scope for the prototype but should be addressed before production launch:

- **Real partner integration:** Replace mock with PayU/LazyPay sandbox, then production credentials. Requires contract validation and end-to-end testing.
- **ML-based credit scoring:** Evolve from rules to a model that incorporates transaction history, repayment behavior, and external credit signals.
- **KYC/AML integration:** Real identity verification flow with document upload and verification provider.
- **EMI calculation engine:** Proper interest computation, prepayment handling, and regulatory disclosure.
- **Multi-currency and multi-geography:** Extend beyond INR if GrabCredit expands.
- **User authentication:** Proper session management, OAuth, and secure token handling.
- **Load testing:** Validate performance under 10K+ concurrent eligibility checks.
- **Merchant-embedded widget:** JavaScript SDK that merchants drop into their checkout page, passing real cart value to GrabCredit's API. Eliminates cart value estimation entirely.
