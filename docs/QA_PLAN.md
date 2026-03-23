# QA Plan — GrabCredit

## Test Plan for BNPL Eligibility & Checkout System

| Field | Value |
|-------|-------|
| **Author** | GrabOn Engineering |
| **Version** | 1.0 |
| **Date** | March 2026 |
| **Status** | DRAFT |

---

## 1. Test Strategy Overview

### 1.1 Scope

This QA plan covers all backend services and frontend surfaces of the GrabCredit BNPL prototype:

- **Eligibility Engine** — 5 rules, reason code generation, recovery option calculation
- **Checkout Orchestrator** — State machine transitions, partner dispatch, retry logic
- **Webhook Handler** — Callback processing, idempotency, duplicate detection
- **Mock Partner Service** — Configurable behavior modes (success, decline, transient, timeout, duplicate)
- **API Layer** — Request validation, error handling, response contracts
- **Dashboard & Simulator** — Data endpoints, test harness controls
- **Frontend** — Scenario Simulator, Consumer Checkout, Operator Dashboard

### 1.2 Approach

- **Scenario-based testing** aligned with the 11 pre-built demo scenarios from PRD §11.2.
- **Edge case and boundary testing** for inputs at rule thresholds.
- **Negative testing** for invalid inputs, expired states, and malformed payloads.
- **State machine verification** ensuring no invalid transitions occur.
- **Idempotency verification** for webhooks and checkout initiation.

### 1.3 Environment

- Backend: FastAPI on `localhost:8000`
- Frontend: Next.js on `localhost:3000`
- Database: Supabase (Postgres) with pre-seeded test data from `sql/002_seed_data.sql`
- All tests use the mock partner service (no external dependencies)

### 1.4 Test Data

Pre-seeded users, merchants, and deals as defined in `sql/002_seed_data.sql`. Tests reference these by name for clarity:

| User | Key Attributes | Test Purpose |
|------|---------------|--------------|
| Priya Sharma | KYC complete, GOLD, ₹20K limit | Happy path |
| Rahul Verma | KYC complete, SILVER, ₹10K limit | Cart limit, partial BNPL |
| Anita Desai | KYC incomplete, GOLD, ₹15K limit | KYC failure |
| Vikram Singh | KYC complete, BRONZE, ₹5K limit | Credit tier failure |
| Meera Patel | KYC complete, PLATINUM, ₹50K limit | High-value user |

---

## 2. Eligibility Engine Test Cases

### 2.1 Positive Cases

| ID | Scenario | User | Merchant | Cart Value | Expected Decision | Expected Reason Codes | Notes |
|----|----------|------|----------|-----------|-------------------|----------------------|-------|
| EL-01 | Happy path — all rules pass | Priya Sharma | Flipkart Electronics | ₹8,000 | APPROVED | [] | EMI terms must be present with 3, 6, 9, 12 month options |
| EL-02 | High-value user happy path | Meera Patel | Flipkart Electronics | ₹45,000 | APPROVED | [] | Validates PLATINUM tier and high limit |
| EL-03 | Cart exactly at BNPL limit | Priya Sharma | Flipkart Electronics | ₹20,000 | APPROVED | [] | Boundary: equal to limit is not exceeding |
| EL-04 | SILVER tier passes credit check | Rahul Verma | Amazon Fashion | ₹5,000 | APPROVED | [] | SILVER is minimum qualifying tier |
| EL-05 | 5th check in window (at limit) | Priya Sharma | Flipkart Electronics | ₹8,000 | APPROVED | [] | 5th check should pass; velocity limit is exceeded on 6th |

### 2.2 Negative Cases — Single Rule Failures

| ID | Scenario | User | Merchant | Cart Value | Expected Decision | Expected Reason Codes | Expected Recovery |
|----|----------|------|----------|-----------|-------------------|----------------------|-------------------|
| EL-06 | KYC incomplete | Anita Desai | Flipkart Electronics | ₹5,000 | DECLINED | [KYC_INCOMPLETE] | INLINE_KYC with CTA to complete KYC |
| EL-07 | Credit tier insufficient (BRONZE) | Vikram Singh | Flipkart Electronics | ₹3,000 | DECLINED | [CREDIT_TIER_INSUFFICIENT] | UPGRADE_PATH with guidance |
| EL-08 | Cart exceeds limit (sole failure) | Rahul Verma | Flipkart Electronics | ₹15,000 | DECLINED | [CART_VALUE_EXCEEDS_LIMIT] | PARTIAL_BNPL: upfront ₹5,000 + BNPL ₹10,000 with EMI terms |
| EL-09 | Merchant not BNPL-eligible | Priya Sharma | Local Store | ₹5,000 | DECLINED | [MERCHANT_NOT_ELIGIBLE] | ALT_DEALS (optional) |
| EL-10 | Velocity limit exceeded (6th check) | Any user | Flipkart Electronics | ₹8,000 | DECLINED | [VELOCITY_LIMIT_EXCEEDED] | No recovery options (abuse category) |

### 2.3 Negative Cases — Multiple Rule Failures

| ID | Scenario | User | Merchant | Cart Value | Expected Decision | Expected Reason Codes | Expected Recovery |
|----|----------|------|----------|-----------|-------------------|----------------------|-------------------|
| EL-11 | KYC incomplete + merchant ineligible | Anita Desai | Local Store | ₹5,000 | DECLINED | [KYC_INCOMPLETE, MERCHANT_NOT_ELIGIBLE] | INLINE_KYC (no PARTIAL_BNPL since not sole failure) |
| EL-12 | KYC incomplete + cart exceeds limit | Anita Desai | Flipkart Electronics | ₹20,000 | DECLINED | [KYC_INCOMPLETE, CART_VALUE_EXCEEDS_LIMIT] | INLINE_KYC only; no PARTIAL_BNPL (cart limit is not sole failure) |
| EL-13 | BRONZE tier + cart exceeds limit | Vikram Singh | Flipkart Electronics | ₹8,000 | DECLINED | [CREDIT_TIER_INSUFFICIENT, CART_VALUE_EXCEEDS_LIMIT] | UPGRADE_PATH only; no PARTIAL_BNPL |
| EL-14 | All rules fail (except velocity) | Anita Desai (BRONZE, if modified) | Local Store | ₹50,000 | DECLINED | Multiple codes | No PARTIAL_BNPL; recovery for each applicable rule |

### 2.4 Boundary & Edge Cases

| ID | Scenario | Input | Expected | Notes |
|----|----------|-------|----------|-------|
| EL-15 | Cart value = limit + ₹1 | Priya + Flipkart + ₹20,001 | DECLINED: CART_VALUE_EXCEEDS_LIMIT | Partial BNPL: ₹1 upfront + ₹20,000 EMI. But minimum upfront is ₹100 — verify handling. |
| EL-16 | Cart value = 0 | Priya + Flipkart + ₹0 | 400: INVALID_PAYLOAD | Validation should reject zero cart |
| EL-17 | Negative cart value | Priya + Flipkart + -₹100 | 400: INVALID_PAYLOAD | Validation should reject negative values |
| EL-18 | Non-existent user ID | Random UUID | 404 or 400 | USER_NOT_FOUND or INVALID_PAYLOAD |
| EL-19 | Non-existent merchant ID | Random UUID | 404 or 400 | MERCHANT_NOT_FOUND or INVALID_PAYLOAD |
| EL-20 | Very large cart value | Priya + Flipkart + ₹999,999,999 | DECLINED: CART_VALUE_EXCEEDS_LIMIT | System handles large decimals without overflow |
| EL-21 | Decision expiry | Check eligibility, wait >15 min, attempt checkout | DECISION_EXPIRED | Decision `expires_at` enforced |
| EL-22 | Partial BNPL minimum upfront | Cart just above limit where upfront < ₹100 | Verify minimum ₹100 upfront enforced | Edge: upfront = cart - limit; if < ₹100, behavior must be defined |

---

## 3. Checkout State Machine Test Cases

### 3.1 State Transition Tests

| ID | Scenario | Partner Behavior | Expected Transitions | Verification |
|----|----------|-----------------|---------------------|-------------|
| CO-01 | Happy path — success | success | INITIATED → PENDING → SUCCESS | partner_ref populated, retry_count = 0 |
| CO-02 | Partner declines | decline | INITIATED → PENDING → DECLINED | error_detail populated |
| CO-03 | Transient failure with retry → success | transient_failure | INITIATED → PENDING (retries) → SUCCESS | retry_count > 0, final state SUCCESS |
| CO-04 | All retries exhausted | transient_failure (all fail) | INITIATED → PENDING → FAILED | retry_count = 3, error_detail populated |
| CO-05 | Timeout — no callback | timeout | INITIATED → PENDING → TIMED_OUT | Transition after 5 minutes via background job |
| CO-06 | Duplicate callback | duplicate | INITIATED → PENDING → SUCCESS | Second callback logged in callback_logs with is_duplicate = true |

### 3.2 Error & Edge Cases

| ID | Scenario | Input | Expected | Notes |
|----|----------|-------|----------|-------|
| CO-07 | Checkout with expired decision | decision_id where expires_at < now() | 400: DECISION_EXPIRED | Must validate decision expiry before creating checkout |
| CO-08 | Double checkout initiation | Same decision_id twice | 409: CHECKOUT_ALREADY_EXISTS | Idempotency key or decision_id uniqueness prevents duplicate |
| CO-09 | Partner 4xx error | Partner returns 400/422 | INITIATED → FAILED | No retry on 4xx; mark FAILED immediately |
| CO-10 | Late callback after timeout | Callback arrives after TIMED_OUT | State unchanged (TIMED_OUT) | Callback logged with is_late = true, no state transition |
| CO-11 | Checkout with non-existent decision | Random UUID as decision_id | 404: DECISION_NOT_FOUND | |
| CO-12 | Partial BNPL checkout | is_partial_bnpl = true, amount = BNPL portion | INITIATED → ... → SUCCESS | Amount is BNPL portion only (user.max_bnpl_limit) |
| CO-13 | Invalid EMI tenure | emi_tenure_months = 7 (not 3/6/9/12) | 400: INVALID_PAYLOAD | Only valid tenures accepted |

### 3.3 State Machine Invariants

These invariants must hold for ALL test cases:

- No backward transitions (e.g., SUCCESS → PENDING is impossible)
- Terminal states (SUCCESS, DECLINED, FAILED, TIMED_OUT) are immutable
- Every state transition updates `updated_at` timestamp
- `idempotency_key` is unique across all checkout attempts
- `retry_count` accurately reflects number of partner request attempts

---

## 4. Webhook Handler Test Cases

| ID | Scenario | Callback Payload | Expected Response | Expected Side Effect |
|----|----------|-----------------|-------------------|---------------------|
| WH-01 | Valid success callback | Valid payload with matching idempotency_key | 200: { received: true, is_duplicate: false } | Checkout transitions to SUCCESS |
| WH-02 | Valid decline callback | Status = "declined" | 200: { received: true, is_duplicate: false } | Checkout transitions to DECLINED |
| WH-03 | Duplicate callback | Same idempotency_key as WH-01 | 200: { received: true, is_duplicate: true } | No state change; logged in callback_logs with is_duplicate = true |
| WH-04 | Unknown idempotency key | Non-existent key | 400: { error: "Unknown idempotency key" } | Logged as orphan callback |
| WH-05 | Malformed JSON body | Invalid JSON string | 400: INVALID_PAYLOAD | No database writes |
| WH-06 | Missing required fields | Payload missing `status` field | 400: INVALID_PAYLOAD | No database writes |
| WH-07 | Callback for terminal state | Callback for checkout already in SUCCESS | 200: { received: true, is_duplicate: true } | No state change; logged |
| WH-08 | Late callback after timeout | Callback for TIMED_OUT checkout | 200 | Logged with is_late = true; no state change |
| WH-09 | Response time | Any valid callback | Response within 5 seconds | Per US-12 acceptance criteria |

---

## 5. Dashboard & Simulator Test Cases

### 5.1 Dashboard Data Endpoints

| ID | Scenario | Endpoint | Expected |
|----|----------|----------|----------|
| DA-01 | List decisions with filter | GET /api/dashboard/decisions?decision=APPROVED | Only APPROVED decisions returned |
| DA-02 | Decision detail with checkout history | GET /api/dashboard/decisions/{id} | Full risk signals, checkout attempts linked |
| DA-03 | Checkout health summary | GET /api/dashboard/checkouts/health | Correct by_status counts, failure_rate calculation, health color |
| DA-04 | Callback stats | GET /api/dashboard/callbacks/stats | Total, duplicate_count, duplicate_rate accurate |
| DA-05 | Pagination | GET /api/dashboard/decisions?limit=10&offset=10 | Correct page of results |
| DA-06 | Filter by duplicate | GET /api/dashboard/callbacks?is_duplicate=true | Only duplicate callbacks shown |

### 5.2 Simulator Endpoints

| ID | Scenario | Endpoint | Expected |
|----|----------|----------|----------|
| SI-01 | List test users | GET /api/simulator/users | All 5 seeded users returned |
| SI-02 | List merchants | GET /api/simulator/merchants | All 4 seeded merchants returned |
| SI-03 | Toggle KYC status | POST /api/simulator/toggle-kyc/{user_id} | KYC flips completed ↔ incomplete; previous_status in response |
| SI-04 | Reset velocity | POST /api/simulator/reset-velocity/{user_id} | All velocity_events for user deleted; subsequent check passes velocity |
| SI-05 | List deals by merchant | GET /api/simulator/deals?merchant_id={id} | Only deals for specified merchant |

---

## 6. End-to-End Scenario Tests

These map directly to PRD §11.2 demonstration scenarios. Each test runs the full flow: eligibility check → (optional) checkout → (optional) callback → final state verification.

| ID | PRD Scenario | Steps | Expected Final State | Verification Points |
|----|-------------|-------|---------------------|-------------------|
| E2E-01 | Happy path | Priya + Flipkart + ₹8,000 + success | Checkout: SUCCESS | Decision APPROVED, EMI terms present, checkout SUCCESS, partner_ref populated |
| E2E-02 | KYC incomplete | Anita + Flipkart + ₹5,000 | Decision: DECLINED | reason_codes = [KYC_INCOMPLETE], recovery = INLINE_KYC, no checkout initiated |
| E2E-03 | Low credit tier | Vikram + Flipkart + ₹5,000 | Decision: DECLINED | reason_codes = [CREDIT_TIER_INSUFFICIENT], recovery = UPGRADE_PATH |
| E2E-04 | Cart exceeds limit | Rahul + Flipkart + ₹15,000 | Decision: DECLINED | reason_codes = [CART_VALUE_EXCEEDS_LIMIT], recovery = PARTIAL_BNPL (₹5K + ₹10K) |
| E2E-05 | Merchant not eligible | Priya + Local Store + ₹5,000 | Decision: DECLINED | reason_codes = [MERCHANT_NOT_ELIGIBLE] |
| E2E-06 | Velocity limit | 6th check in 1 hour | Decision: DECLINED | reason_codes = [VELOCITY_LIMIT_EXCEEDED], no recovery options |
| E2E-07 | Partner decline | Priya + Flipkart + ₹8,000 + decline | Checkout: DECLINED | Decision APPROVED, then checkout DECLINED by partner |
| E2E-08 | Transient failure + retry | Priya + Flipkart + ₹8,000 + transient | Checkout: SUCCESS | retry_count > 0, exponential backoff observed in logs |
| E2E-09 | Timeout | Priya + Flipkart + ₹8,000 + timeout | Checkout: TIMED_OUT | Transition occurs after ~5 minutes via background job |
| E2E-10 | Duplicate callback | Priya + Flipkart + ₹8,000 + duplicate | Checkout: SUCCESS | callback_logs has 2 entries; second has is_duplicate = true |
| E2E-11 | Partial BNPL accepted | Rahul + Flipkart + ₹15,000 + success | Checkout: SUCCESS (₹10K) | Checkout amount = ₹10,000, is_partial_bnpl = true |

---

## 7. Frontend Test Cases

### 7.1 Scenario Simulator

| ID | Test | Expected |
|----|------|----------|
| FE-01 | Form loads with pre-seeded users and merchants | Dropdowns populated from API |
| FE-02 | Run scenario shows decision result | Full decision object displayed with risk signal breakdown |
| FE-03 | Raw JSON toggle | Shows/hides raw API response JSON |
| FE-04 | Checkout flow shows state transitions | Real-time status updates as checkout progresses |
| FE-05 | Recovery options displayed on decline | Actionable recovery cards shown (partial BNPL, KYC nudge, etc.) |

### 7.2 Consumer Checkout

| ID | Test | Expected |
|----|------|----------|
| FE-06 | Deal page displays correctly | Deal info, cart value input, "Check BNPL" button |
| FE-07 | Approved flow shows EMI terms | EMI breakdown with tenure options |
| FE-08 | Declined flow shows recovery | Specific recovery options per reason code |
| FE-09 | Processing state during checkout | Spinner/progress indicator while PENDING |
| FE-10 | Success confirmation | Order ID, repayment summary displayed |

### 7.3 Operator Dashboard

| ID | Test | Expected |
|----|------|----------|
| FE-11 | Decision log table loads | Paginated, filterable list of decisions |
| FE-12 | Status badges color-coded | APPROVED=green, DECLINED=red, etc. |
| FE-13 | Checkout health indicator | Green/yellow/red based on failure rate |
| FE-14 | Callback logs show duplicate flag | Duplicate callbacks visually distinguished |

---

## 8. Non-Functional Requirements

| Requirement | Target | Measurement Method |
|-------------|--------|-------------------|
| Eligibility check latency (p95) | < 500ms | Backend instrumentation / logs |
| Webhook response time | < 5 seconds | Callback handler timing |
| Dashboard page load | < 2 seconds | Frontend performance measurement |
| Checkout status polling | Every 2 seconds | Frontend polling interval |
| Decision audit completeness | 100% of decisions have reason codes | Database query validation |
| Idempotency key uniqueness | 0 collisions | UNIQUE constraint on checkout_attempts.idempotency_key |
| State machine integrity | 0 invalid transitions | No backward transitions in checkout_attempts |

---

## 9. Test Execution Checklist

Before submission, verify:

- [ ] All 11 E2E scenarios (E2E-01 through E2E-11) pass
- [ ] All 5 eligibility rule failures produce correct reason codes
- [ ] Multiple simultaneous rule failures collect ALL codes (not just first)
- [ ] Partial BNPL only offered when CART_VALUE_EXCEEDS_LIMIT is sole failure
- [ ] Velocity limit enforced at exactly 6th check (5th passes, 6th fails)
- [ ] Checkout state machine never transitions backward
- [ ] Duplicate callbacks logged but do not change state
- [ ] Expired decisions rejected for checkout initiation
- [ ] Dashboard shows accurate health metrics
- [ ] Simulator toggle-kyc and reset-velocity work correctly
- [ ] All API responses match contracts in API_CONTRACTS.md
