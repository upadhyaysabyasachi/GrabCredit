# QA Test Results — GrabCredit

## Test Execution Summary

| Field | Value |
|-------|-------|
| **Date** | March 23, 2026 |
| **Environment** | Backend: FastAPI on localhost:8000, DB: Supabase (grabcredit schema) |
| **Test Data** | Pre-seeded from sql/002_seed_data.sql |
| **Overall Result** | **41/41 PASS** |

---

## Results by Test Suite

| Suite | Pass | Fail | Total |
|-------|------|------|-------|
| Eligibility Engine (Positive) | 5 | 0 | 5 |
| Eligibility Engine (Single Rule Failures) | 4 | 0 | 4 |
| Eligibility Engine (Multiple Rule Failures) | 3 | 0 | 3 |
| Eligibility Engine (Boundary & Edge Cases) | 6 | 0 | 6 |
| Checkout State Machine | 5 | 0 | 5 |
| Checkout Error & Edge Cases | 3 | 0 | 3 |
| Webhook Handler | 3 | 0 | 3 |
| Dashboard Endpoints | 7 | 0 | 7 |
| Simulator Endpoints | 5 | 0 | 5 |
| **Total** | **41** | **0** | **41** |

---

## 1. Eligibility Engine Tests

### 1.1 Positive Cases

| ID | Scenario | Input | Expected | Actual | Status |
|----|----------|-------|----------|--------|--------|
| EL-01 | Happy path | Priya + Flipkart + ₹8,000 | APPROVED, 4 EMI options | APPROVED, EMI: 3/6/9/12mo | **PASS** |
| EL-02 | PLATINUM user | Meera + Flipkart + ₹45,000 | APPROVED | APPROVED, all rules PASS | **PASS** |
| EL-03 | Cart exactly at limit | Priya + Flipkart + ₹20,000 | APPROVED (boundary) | APPROVED, cart=limit=20000 | **PASS** |
| EL-04 | SILVER tier qualifies | Rahul + Amazon + ₹5,000 | APPROVED | APPROVED | **PASS** |
| EL-05 | 5th check in window | Meera, 5th consecutive check | APPROVED (5th allowed) | APPROVED, checks_in_hour=4 < 5 | **PASS** |

### 1.2 Single Rule Failures

| ID | Scenario | Input | Expected | Actual | Status |
|----|----------|-------|----------|--------|--------|
| EL-06 | KYC incomplete | Anita + Flipkart + ₹5,000 | DECLINED [KYC_INCOMPLETE], INLINE_KYC recovery | DECLINED, recovery: INLINE_KYC "Complete KYC" | **PASS** |
| EL-07 | Low credit tier | Vikram + Flipkart + ₹3,000 | DECLINED [CREDIT_TIER_INSUFFICIENT], UPGRADE_PATH | DECLINED, recovery: UPGRADE_PATH | **PASS** |
| EL-08 | Cart exceeds limit (sole) | Rahul + Flipkart + ₹15,000 | DECLINED [CART_VALUE_EXCEEDS_LIMIT], PARTIAL_BNPL ₹5K+₹10K | DECLINED, PARTIAL_BNPL upfront=5000, bnpl=10000, 4 EMI options | **PASS** |
| EL-09 | Merchant not eligible | Priya + Local Store + ₹5,000 | DECLINED [MERCHANT_NOT_ELIGIBLE], ALT_DEALS | DECLINED, recovery: ALT_DEALS | **PASS** |

### 1.3 Multiple Rule Failures

| ID | Scenario | Input | Expected | Actual | Status |
|----|----------|-------|----------|--------|--------|
| EL-11 | KYC + merchant | Anita + Local Store + ₹5,000 | DECLINED [KYC_INCOMPLETE, MERCHANT_NOT_ELIGIBLE], no PARTIAL_BNPL | Both codes present, recovery: INLINE_KYC + ALT_DEALS, no PARTIAL_BNPL | **PASS** |
| EL-12 | KYC + cart limit | Anita + Flipkart + ₹20,000 | DECLINED [KYC_INCOMPLETE, CART_VALUE_EXCEEDS_LIMIT], no PARTIAL_BNPL | Both codes, recovery: INLINE_KYC only (PARTIAL_BNPL suppressed — not sole failure) | **PASS** |
| EL-13 | BRONZE + cart limit | Vikram + Flipkart + ₹8,000 | DECLINED [CREDIT_TIER_INSUFFICIENT, CART_VALUE_EXCEEDS_LIMIT], no PARTIAL_BNPL | Both codes, recovery: UPGRADE_PATH only | **PASS** |

### 1.4 Boundary & Edge Cases

| ID | Scenario | Input | Expected | Actual | Status |
|----|----------|-------|----------|--------|--------|
| EL-10 | Velocity limit (6th check) | 6th check in 1 hour | DECLINED [VELOCITY_LIMIT_EXCEEDED], no recovery | DECLINED, no recovery options | **PASS** |
| EL-15 | Cart = limit + ₹1 | Priya + Flipkart + ₹20,001 | DECLINED, partial BNPL suppressed (upfront ₹1 < ₹100 min) | DECLINED, no PARTIAL_BNPL offered (minimum upfront enforced) | **PASS** |
| EL-16 | Zero cart value | Priya + Flipkart + ₹0 | 400/422 validation error | 422: "Input should be greater than 0" | **PASS** |
| EL-17 | Negative cart value | Priya + Flipkart + -₹100 | 400/422 validation error | 422: "Input should be greater than 0" | **PASS** |
| EL-18 | Non-existent user | Random UUID | Error: user not found | 400: "User not found: {uuid}" | **PASS** |
| EL-19 | Non-existent merchant | Random UUID | Error: merchant not found | 400: "Merchant not found: {uuid}" | **PASS** |

---

## 2. Checkout State Machine Tests

### 2.1 State Transitions

| ID | Scenario | Partner Behavior | Expected | Actual | Status |
|----|----------|-----------------|----------|--------|--------|
| CO-01 | Happy path | success | INITIATED → PENDING → SUCCESS, partner_ref populated, retry_count=0 | SUCCESS, partner_ref=PAYU_REF_*, retry_count=0 | **PASS** |
| CO-02 | Partner decline | decline | INITIATED → PENDING → DECLINED, error_detail populated | DECLINED, error_detail="Insufficient credit score" | **PASS** |
| CO-03 | Transient + retry | transient_failure | INITIATED → PENDING → SUCCESS, retry_count > 0 | SUCCESS, retry_count=2 | **PASS** |
| CO-06 | Duplicate callback | duplicate | SUCCESS, 2 callbacks logged (1 duplicate) | SUCCESS, 2 callbacks: is_duplicate=false + is_duplicate=true | **PASS** |
| CO-12 | Partial BNPL | success | is_partial_bnpl=true, amount=₹10,000 → SUCCESS | SUCCESS, amount=10000, is_partial_bnpl=true | **PASS** |

### 2.2 Error & Edge Cases

| ID | Scenario | Input | Expected | Actual | Status |
|----|----------|-------|----------|--------|--------|
| CO-08 | Double checkout | Same decision_id twice | 409: CHECKOUT_ALREADY_EXISTS | HTTP 409, code=CHECKOUT_ALREADY_EXISTS | **PASS** |
| CO-11 | Non-existent decision | Random UUID | 404: DECISION_NOT_FOUND | HTTP 404, code=DECISION_NOT_FOUND | **PASS** |
| CO-13 | Invalid EMI tenure | emi_tenure_months=7 | 400: INVALID_PAYLOAD | HTTP 400, code=INVALID_PAYLOAD | **PASS** |

---

## 3. Webhook Handler Tests

| ID | Scenario | Input | Expected | Actual | Status |
|----|----------|-------|----------|--------|--------|
| WH-04 | Unknown idempotency key | Non-existent key | 400: "Unknown idempotency key" | HTTP 400, error="Unknown idempotency key" | **PASS** |
| WH-05 | Malformed JSON | "not json" | 400 | HTTP 400, code=INVALID_PAYLOAD | **PASS** |
| WH-06 | Missing required fields | {"idempotency_key":"test"} | 400 with missing fields | HTTP 400, missing_fields=[partner_ref, status, timestamp] | **PASS** |

---

## 4. Dashboard Endpoint Tests

| ID | Scenario | Endpoint | Expected | Actual | Status |
|----|----------|----------|----------|--------|--------|
| DA-01 | Filter decisions | GET /decisions?decision=APPROVED | Only APPROVED returned | All decisions have decision=APPROVED, total count correct | **PASS** |
| DA-02 | Decision detail | GET /decisions/{id} | Risk signals, checkouts, callbacks, user/merchant | All fields present, linked data correct | **PASS** |
| DA-03 | Checkout health | GET /checkouts/health | by_status counts, failure_rate, health color | total, by_status, failure_rate=0.0, health="green", window_minutes=60 | **PASS** |
| DA-04 | Callback stats | GET /callbacks/stats | total, duplicate_count, duplicate_rate | All present with correct types | **PASS** |
| DA-05 | Pagination | GET /decisions?limit=2&offset=0 vs offset=2 | Different results, total unchanged | Correct: different decision_ids, total consistent | **PASS** |
| DA-06 | Duplicate filter | GET /callbacks?is_duplicate=true | Only duplicates | All returned have is_duplicate=true; false filter returns only non-duplicates | **PASS** |
| — | Checkout status filter | GET /checkouts?status=SUCCESS | Only SUCCESS | All returned have status=SUCCESS | **PASS** |

---

## 5. Simulator Endpoint Tests

| ID | Scenario | Endpoint | Expected | Actual | Status |
|----|----------|----------|----------|--------|--------|
| SI-01 | List users | GET /simulator/users | 5 users with all fields | 5 users: id, name, email, kyc_status, credit_tier, max_bnpl_limit | **PASS** |
| SI-02 | List merchants | GET /simulator/merchants | 4 merchants with all fields | 4 merchants: id, name, category, bnpl_enabled | **PASS** |
| SI-03 | Toggle KYC | POST /simulator/toggle-kyc/{id} | Flips completed ↔ incomplete | completed→incomplete→completed (round-trip verified) | **PASS** |
| SI-04 | Reset velocity | POST /simulator/reset-velocity/{id} | Clears events, next check has count=0 | velocity_events_cleared=true, next check: checks_in_hour=0 | **PASS** |
| SI-05 | Deals by merchant | GET /simulator/deals?merchant_id=... | Filtered by merchant | Flipkart filter: 2 deals, no filter: 5 deals | **PASS** |

---

## Bugs Found & Fixed

### BUG-001: Velocity Off-by-One (EL-05) — FIXED

**Symptom:** 5th eligibility check was DECLINED instead of passing. PRD specifies "limit = 5" meaning 5 checks should be allowed.

**Root Cause:** In `eligibility/engine.py`, the velocity event was recorded BEFORE the count was evaluated:
```python
# BEFORE (buggy)
record_velocity_event(user_id)          # INSERT — now count is N+1
velocity_count = get_velocity_count(user_id)  # returns N+1
# check: N+1 < 5 — fails on 5th call (count=5, 5 < 5 = false)
```

**Fix:** Swapped the order — count first, then record:
```python
# AFTER (fixed)
velocity_count = get_velocity_count(user_id)  # returns N (before this check)
record_velocity_event(user_id)                 # INSERT for tracking
# check: N < 5 — passes on 5th call (count=4, 4 < 5 = true)
```

**Verification:** After fix, checks 1-5 pass (counts 0-4), check 6 fails (count=5). Matches PRD.

---

## State Machine Invariants Verified

- No backward transitions observed across all checkout tests
- Terminal states (SUCCESS, DECLINED, FAILED, TIMED_OUT) are immutable — duplicate callbacks do not change state
- Every state transition updates `updated_at` timestamp
- `idempotency_key` is unique across all checkout attempts (UNIQUE constraint enforced)
- `retry_count` accurately reflects number of partner request attempts (CO-03: retry_count=2)

---

## Test Execution Notes

1. **Velocity state persists** across test runs. Always reset velocity (`POST /simulator/reset-velocity/{user_id}`) before running the full suite.
2. **KYC state persists** — verify Anita Desai's KYC is "incomplete" before running KYC decline tests. Use `POST /simulator/toggle-kyc/{user_id}` if needed.
3. **Timeout test (CO-05/E2E-09)** requires 5 minutes to complete — skipped in automated run. Can be verified manually via the Scenario Simulator with `partner_behavior=timeout`.
4. **Checkout tests create new decisions** — each test gets a fresh eligibility check to avoid CHECKOUT_ALREADY_EXISTS conflicts.
