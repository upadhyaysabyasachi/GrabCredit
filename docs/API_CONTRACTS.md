# API Contracts — GrabCredit

## Base URL

```
http://localhost:8000
```

All responses are JSON. All request bodies are JSON with `Content-Type: application/json`.

---

## 1. Eligibility Check

### `POST /api/eligibility/check`

Check BNPL eligibility for a checkout scenario.

**Request Body:**
```json
{
    "user_id": "a1000000-0000-0000-0000-000000000001",
    "merchant_id": "b2000000-0000-0000-0000-000000000001",
    "cart_value": 8000.00,
    "deal_id": "c3000000-0000-0000-0000-000000000001"  // optional
}
```

**Response (200 — APPROVED):**
```json
{
    "decision_id": "uuid",
    "user_id": "uuid",
    "merchant_id": "uuid",
    "cart_value": 8000.00,
    "decision": "APPROVED",
    "reason_codes": [],
    "risk_signals": {
        "kyc_status": { "rule": "R1", "input": "completed", "result": "PASS" },
        "credit_tier": { "rule": "R2", "input": "GOLD", "result": "PASS" },
        "cart_value_limit": { "rule": "R3", "input": { "cart": 8000, "limit": 20000 }, "result": "PASS" },
        "merchant_eligibility": { "rule": "R4", "input": true, "result": "PASS" },
        "velocity_check": { "rule": "R5", "input": { "checks_in_hour": 1, "limit": 5 }, "result": "PASS" }
    },
    "emi_terms": {
        "options": [
            { "tenure_months": 3, "monthly_emi": 2711, "interest_rate": 1.5, "total_amount": 8133 },
            { "tenure_months": 6, "monthly_emi": 1372, "interest_rate": 1.5, "total_amount": 8232 },
            { "tenure_months": 9, "monthly_emi": 925, "interest_rate": 1.5, "total_amount": 8325 },
            { "tenure_months": 12, "monthly_emi": 702, "interest_rate": 1.5, "total_amount": 8424 }
        ]
    },
    "recovery_options": null,
    "expires_at": "2026-03-21T15:15:00Z",
    "created_at": "2026-03-21T15:00:00Z"
}
```

**Response (200 — DECLINED with recovery):**
```json
{
    "decision_id": "uuid",
    "decision": "DECLINED",
    "reason_codes": ["CART_VALUE_EXCEEDS_LIMIT"],
    "risk_signals": { ... },
    "emi_terms": null,
    "recovery_options": [
        {
            "type": "PARTIAL_BNPL",
            "upfront_amount": 5000.00,
            "bnpl_amount": 10000.00,
            "emi_terms": {
                "options": [
                    { "tenure_months": 3, "monthly_emi": 3389, "interest_rate": 1.5, "total_amount": 10167 }
                ]
            },
            "message": "Pay ₹5,000 upfront and split ₹10,000 into EMIs",
            "cta_label": "Pay ₹5,000 now + EMI",
            "cta_action": "initiate_split_checkout"
        }
    ],
    "expires_at": "2026-03-21T15:15:00Z",
    "created_at": "2026-03-21T15:00:00Z"
}
```

**Response (200 — DECLINED, velocity limit):**
```json
{
    "decision_id": "uuid",
    "decision": "DECLINED",
    "reason_codes": ["VELOCITY_LIMIT_EXCEEDED"],
    "recovery_options": null,
    ...
}
```

---

## 2. Checkout

### `POST /api/checkout/initiate`

Initiate a BNPL checkout after approval.

**Request Body:**
```json
{
    "decision_id": "uuid",
    "emi_tenure_months": 3,
    "partner_behavior": "success",  // For mock: success | decline | transient_failure | timeout | duplicate
    "is_partial_bnpl": false,
    "amount": 8000.00  // Override for partial BNPL; otherwise uses decision cart_value
}
```

> **Note:** The `idempotency_key` is generated server-side by the backend. The client does not provide it. Format: `grabcredit_{decision_id}_{timestamp_ms}`. It is returned in the response for reference.

**Response (200):**
```json
{
    "checkout_id": "uuid",
    "decision_id": "uuid",
    "idempotency_key": "grabcredit_uuid_1711029600000",
    "status": "INITIATED",
    "amount": 8000.00,
    "created_at": "2026-03-21T15:00:00Z"
}
```

**Example — Partial BNPL Checkout:**

When a user accepts the partial BNPL recovery option, the checkout is initiated for the BNPL portion only:

```json
{
    "decision_id": "uuid",
    "emi_tenure_months": 3,
    "partner_behavior": "success",
    "is_partial_bnpl": true,
    "amount": 10000.00
}
```

Response:
```json
{
    "checkout_id": "uuid",
    "decision_id": "uuid",
    "idempotency_key": "grabcredit_uuid_1711029600001",
    "status": "INITIATED",
    "amount": 10000.00,
    "is_partial_bnpl": true,
    "created_at": "2026-03-21T15:00:00Z"
}
```

### `GET /api/checkout/{checkout_id}/status`

Poll for checkout status updates.

**Response (200):**
```json
{
    "checkout_id": "uuid",
    "status": "SUCCESS",
    "partner_ref": "PAYU_REF_123456",
    "error_detail": null,
    "retry_count": 0,
    "created_at": "2026-03-21T15:00:00Z",
    "updated_at": "2026-03-21T15:00:03Z"
}
```

> **Polling Guidance:** Frontend should poll this endpoint every **2 seconds**. Maximum polling duration: **5 minutes**. After 5 minutes with no terminal state (`SUCCESS`, `DECLINED`, `FAILED`), the backend's timeout job will transition the checkout to `TIMED_OUT`, which the next poll will pick up.

---

## 3. Webhook (Partner Callback)

### `POST /api/webhook/partner-callback`

Receives callbacks from the mock partner.

**Request Body (from partner):**
```json
{
    "idempotency_key": "grabcredit_uuid_1711029600000",
    "partner_ref": "PAYU_REF_123456",
    "status": "success",
    "decline_reason": null,
    "error_code": null,
    "timestamp": "2026-03-21T15:00:03Z"
}
```

**Response (200):**
```json
{
    "received": true,
    "is_duplicate": false
}
```

**Response (400 — unknown checkout):**
```json
{
    "error": "Unknown idempotency key",
    "received": false
}
```

---

## 4. Dashboard Endpoints

### `GET /api/dashboard/decisions`

List all eligibility decisions with optional filters.

**Query Params:** `?user_id=uuid&decision=APPROVED&limit=50&offset=0`

**Response (200):**
```json
{
    "decisions": [ ... ],
    "total": 42,
    "limit": 50,
    "offset": 0
}
```

### `GET /api/dashboard/decisions/{decision_id}`

Get full decision detail with checkout history.

### `GET /api/dashboard/checkouts`

List all checkout attempts. **Query Params:** `?status=FAILED&limit=50&offset=0`

### `GET /api/dashboard/checkouts/health`

Get health summary for last 1 hour.

**Response (200):**
```json
{
    "total": 100,
    "by_status": { "SUCCESS": 85, "DECLINED": 5, "FAILED": 7, "TIMED_OUT": 2, "PENDING": 1 },
    "failure_rate": 0.07,
    "health": "yellow",
    "window_minutes": 60
}
```

> **Health Status Thresholds:** `green` = failure_rate < 0.05 (< 5%), `yellow` = failure_rate between 0.05 and 0.10 (5–10%), `red` = failure_rate >= 0.10 (>= 10%). These thresholds align with the kill/iterate/scale criteria in PRD §15.

### `GET /api/dashboard/callbacks`

List callback logs. **Query Params:** `?is_duplicate=true&limit=50`

### `GET /api/dashboard/callbacks/stats`

Callback health stats — total, duplicate count, duplicate rate.

---

## 5. Simulator Endpoints

### `GET /api/simulator/users`

List all test users.

### `GET /api/simulator/merchants`

List all test merchants.

### `GET /api/simulator/deals`

List all deals, optionally filtered by merchant_id.

### `POST /api/simulator/toggle-kyc/{user_id}`

Toggle a user's KYC status (for simulating KYC completion recovery flow).

**Response (200):**
```json
{
    "user_id": "uuid",
    "kyc_status": "completed",
    "previous_status": "incomplete"
}
```

### `POST /api/simulator/reset-velocity/{user_id}`

Clear velocity events for a user (for retesting).

---

## 6. Error Responses

All errors follow this format:

```json
{
    "error": "Human-readable error message",
    "code": "MACHINE_READABLE_CODE",
    "details": {}  // optional
}
```

Common error codes:
- `DECISION_EXPIRED` — Decision has expired (> 15 minutes old)
- `DECISION_NOT_FOUND` — Invalid decision_id
- `CHECKOUT_ALREADY_EXISTS` — Checkout already initiated for this decision
- `INVALID_PAYLOAD` — Request body validation failed
- `CHECKOUT_NOT_FOUND` — Invalid checkout_id

### Error Code Mapping by Endpoint

| Endpoint | Possible Error Codes | HTTP Status |
|----------|---------------------|-------------|
| `POST /api/eligibility/check` | `INVALID_PAYLOAD` | 400 |
| `POST /api/checkout/initiate` | `INVALID_PAYLOAD`, `DECISION_NOT_FOUND`, `DECISION_EXPIRED`, `CHECKOUT_ALREADY_EXISTS` | 400, 404, 409 |
| `GET /api/checkout/{id}/status` | `CHECKOUT_NOT_FOUND` | 404 |
| `POST /api/webhook/partner-callback` | `INVALID_PAYLOAD` (malformed body), unknown idempotency key | 400 |
