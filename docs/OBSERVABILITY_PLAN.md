# Observability Plan — GrabCredit

## Metrics, Logging, Alerting, and Operational Visibility

| Field | Value |
|-------|-------|
| **Author** | GrabOn Engineering |
| **Version** | 1.0 |
| **Date** | March 2026 |
| **Status** | DRAFT |

---

## 1. Logging Strategy

### 1.1 Format

All backend services use structured JSON logging. Every log entry includes a base set of fields for correlation and filtering.

**Base fields (every log entry):**

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | ISO 8601 | When the event occurred |
| `level` | Enum | `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `service` | String | `eligibility`, `checkout`, `webhook`, `partner`, `dashboard`, `simulator` |
| `action` | String | What happened (e.g., `eligibility_check`, `state_transition`, `callback_received`) |
| `request_id` | UUID | Unique per API request, propagated through all downstream calls |
| `user_id` | UUID | User context (when available) |
| `merchant_id` | UUID | Merchant context (when available) |
| `duration_ms` | Integer | Time taken for the operation (when applicable) |

### 1.2 Log Levels by Event

| Level | When to Use | Examples |
|-------|------------|---------|
| **ERROR** | Unrecoverable failures, data integrity issues | Database write failure, state machine violation, unhandled exception |
| **WARN** | Recoverable issues, edge cases, approaching limits | Retry attempt, velocity limit hit, duplicate callback, late callback |
| **INFO** | Normal business events, state transitions | Eligibility decision made, checkout state changed, callback processed |
| **DEBUG** | Detailed payloads, internal state (development only) | Full request/response bodies, rule evaluation details, partner payloads |

### 1.3 Key Log Events

| Event | Level | Service | Fields | Purpose |
|-------|-------|---------|--------|---------|
| `eligibility_check` | INFO | eligibility | decision_id, decision, reason_codes, cart_value, duration_ms | Track every eligibility decision |
| `rule_evaluation` | DEBUG | eligibility | rule_id, input, result, reason_code | Detailed rule breakdown |
| `velocity_limit_hit` | WARN | eligibility | user_id, checks_in_window, limit | Detect potential abuse |
| `checkout_initiated` | INFO | checkout | checkout_id, decision_id, amount, is_partial_bnpl | Track checkout creation |
| `state_transition` | INFO | checkout | checkout_id, from_state, to_state, trigger | Audit state machine changes |
| `partner_request` | INFO | partner | checkout_id, idempotency_key, attempt_number, duration_ms | Track partner API calls |
| `partner_retry` | WARN | partner | checkout_id, attempt_number, error_code, backoff_ms | Track retry behavior |
| `partner_failure` | ERROR | partner | checkout_id, attempt_number, error_code, error_detail | All retries exhausted |
| `callback_received` | INFO | webhook | idempotency_key, status, is_duplicate, is_late | Track all callbacks |
| `callback_duplicate` | WARN | webhook | idempotency_key, original_callback_id | Duplicate detection |
| `callback_orphan` | WARN | webhook | idempotency_key, reason | Unknown checkout callback |
| `callback_late` | WARN | webhook | idempotency_key, checkout_id, checkout_status | Callback after terminal state |
| `timeout_triggered` | INFO | checkout | checkout_id, pending_duration_seconds | Timeout job transitions |
| `decision_expired` | WARN | checkout | decision_id, expired_at, attempted_at | Expired decision used for checkout |

### 1.4 Log Retention

| Environment | Retention | Storage |
|-------------|-----------|---------|
| Prototype | Indefinite (local files / stdout) | Console output |
| Production (recommended) | 30 days hot, 90 days warm, 1 year cold | Cloud logging service (Datadog, CloudWatch, etc.) |

---

## 2. Key Metrics

### 2.1 Eligibility Metrics

| Metric | Type | Source | Description | Alert Threshold |
|--------|------|--------|-------------|----------------|
| `eligibility.check.latency_ms` | Histogram | Eligibility engine | Time to evaluate all 5 rules and persist decision | p95 > 500ms |
| `eligibility.check.count` | Counter (by decision) | Eligibility engine | Total checks, split by APPROVED / DECLINED | — |
| `eligibility.approval_rate` | Gauge (1h rolling) | Computed from check.count | Percentage of checks resulting in APPROVED | < 20% or > 80% |
| `eligibility.decline.by_reason` | Counter (by reason_code) | Eligibility engine | Breakdown of decline reasons | — |
| `eligibility.recovery.offered` | Counter (by type) | Eligibility engine | Recovery options offered (PARTIAL_BNPL, INLINE_KYC, etc.) | — |
| `eligibility.velocity.limit_hit_rate` | Gauge (1h rolling) | Eligibility engine | Percentage of checks hitting velocity limit | > 10% |

### 2.2 Checkout Metrics

| Metric | Type | Source | Description | Alert Threshold |
|--------|------|--------|-------------|----------------|
| `checkout.initiated.count` | Counter | Checkout orchestrator | Total checkouts initiated | — |
| `checkout.completion_rate` | Gauge (1h rolling) | Computed | Percentage of INITIATED reaching SUCCESS | < 60% |
| `checkout.failure_rate` | Gauge (1h rolling) | Computed | Percentage reaching FAILED or TIMED_OUT | > 10% |
| `checkout.state_transition` | Counter (by from → to) | State machine | Every state transition, broken down by source and target | — |
| `checkout.timeout_rate` | Gauge (1h rolling) | Computed | Percentage of checkouts reaching TIMED_OUT | > 5% |
| `checkout.retry_count` | Histogram | Partner client | Number of retries per checkout attempt | — |

### 2.3 Partner Integration Metrics

| Metric | Type | Source | Description | Alert Threshold |
|--------|------|--------|-------------|----------------|
| `partner.request.latency_ms` | Histogram | Partner client | Time for partner to acknowledge request | p95 > 5,000ms |
| `partner.request.error_rate` | Gauge (1h rolling) | Partner client | Percentage of partner requests returning 4xx/5xx | > 5% |
| `partner.request.timeout_rate` | Gauge | Partner client | Percentage of partner requests timing out (10s) | > 2% |

### 2.4 Webhook Metrics

| Metric | Type | Source | Description | Alert Threshold |
|--------|------|--------|-------------|----------------|
| `webhook.callback.count` | Counter | Webhook handler | Total callbacks received | — |
| `webhook.callback.latency_ms` | Histogram | Webhook handler | Time to process a callback and respond | p95 > 3,000ms |
| `webhook.callback.duplicate_rate` | Gauge (1h rolling) | Webhook handler | Percentage of callbacks marked as duplicate | > 5% |
| `webhook.callback.orphan_count` | Counter | Webhook handler | Callbacks for unknown idempotency keys | > 0 per hour |
| `webhook.callback.late_count` | Counter | Webhook handler | Callbacks arriving after checkout terminal state | > 0 per hour |
| `webhook.callback.success_rate` | Gauge (1h rolling) | Computed | Percentage of callbacks processed without error | < 95% |

---

## 3. Alerting Rules

### 3.1 P1 Alerts (Immediate Action Required)

| Alert Name | Condition | Duration | Action |
|------------|-----------|----------|--------|
| **Checkout Failure Spike** | `checkout.failure_rate > 15%` | 5 minutes sustained | Page on-call. Check partner status. Prepare kill switch. |
| **Partner Callback Blackout** | Zero callbacks received while checkouts are PENDING | 10 minutes | Page on-call. Verify webhook endpoint health. Contact partner. |
| **Approval Rate Anomaly** | `eligibility.approval_rate < 10% OR > 90%` | 1 hour sustained | Page on-call. Check for rule misconfiguration or data issue. |
| **State Machine Violation** | Any backward state transition detected | Immediate | Page on-call. Data integrity investigation. Potential rollback. |
| **Eligibility Engine Down** | Eligibility check endpoint returns 5xx | 2 minutes | Page on-call. Check database connectivity, service health. |

### 3.2 P2 Alerts (Investigate Within 1 Hour)

| Alert Name | Condition | Duration | Action |
|------------|-----------|----------|--------|
| **Approval Rate Drift** | `eligibility.approval_rate < 20% OR > 80%` | 1 hour sustained | Review rule thresholds. Check for data changes. |
| **Checkout Completion Low** | `checkout.completion_rate < 60%` | 2 hours sustained | Investigate UX friction, partner response times. |
| **Callback Duplicate Spike** | `webhook.callback.duplicate_rate > 5%` | 30 minutes sustained | Investigate partner retry behavior. Check idempotency. |
| **Eligibility Latency Degradation** | `eligibility.check.latency_ms p95 > 500ms` | 10 minutes sustained | Check database query performance, velocity table size. |
| **High Timeout Rate** | `checkout.timeout_rate > 5%` | 30 minutes sustained | Check partner responsiveness. Verify timeout job running. |
| **Velocity Limit Hit Spike** | `eligibility.velocity.limit_hit_rate > 10%` | 1 hour sustained | Investigate potential abuse or legitimate usage pattern. |

### 3.3 P3 Alerts (Review Next Business Day)

| Alert Name | Condition | Duration | Action |
|------------|-----------|----------|--------|
| **Orphan Callbacks** | `webhook.callback.orphan_count > 5` | 24 hours | Review partner integration. Check for key format mismatch. |
| **Late Callbacks** | `webhook.callback.late_count > 10` | 24 hours | Review partner callback timing. Consider extending timeout. |
| **Low Recovery Conversion** | Recovery options offered but never accepted | 7 days | UX review of recovery option presentation. |

---

## 4. Dashboard Panels

### 4.1 System Health Overview (Operator Dashboard — Built in Prototype)

The prototype's operator dashboard serves as the primary observability surface. It provides:

| Panel | Data Source | Refresh Interval |
|-------|-----------|-----------------|
| **Decision Log Table** | `GET /api/dashboard/decisions` | On demand (page load / filter change) |
| **Checkout Status Table** | `GET /api/dashboard/checkouts` | On demand |
| **Checkout Health Summary** | `GET /api/dashboard/checkouts/health` | Every 30 seconds (auto-refresh) |
| **Callback Log Table** | `GET /api/dashboard/callbacks` | On demand |
| **Callback Stats** | `GET /api/dashboard/callbacks/stats` | Every 30 seconds |

### 4.2 Production Dashboard Panels (Grafana / Datadog — Recommended)

For production, the following additional dashboard panels are recommended:

**Overview Dashboard:**
- Approval rate (1h rolling) — line chart with 30-70% band highlighted
- Checkout completion funnel — bar chart (checks → approved → initiated → completed)
- Failure rate (1h rolling) — line chart with 10% threshold line
- System health indicator — single stat (green/yellow/red)

**Eligibility Dashboard:**
- Check volume over time — stacked bar (APPROVED vs DECLINED)
- Decline reason distribution — pie chart
- Latency distribution — histogram (p50, p95, p99)
- Velocity limit hits over time — line chart
- Recovery options offered vs accepted — conversion funnel

**Checkout Dashboard:**
- State transition flow — Sankey diagram (INITIATED → terminal states)
- Checkout duration distribution — histogram (time from INITIATED to terminal)
- Retry count distribution — bar chart
- Timeout rate over time — line chart with threshold

**Partner Dashboard:**
- Partner request latency — line chart (p50, p95, p99)
- Partner error rate — line chart with threshold
- Callback processing latency — histogram
- Duplicate callback rate — line chart
- Orphan/late callback count — bar chart

---

## 5. Tracing & Correlation

### 5.1 Request ID Propagation

Every API request generates a `request_id` (UUID) that is:
- Set in the first middleware layer
- Propagated to all downstream function calls via context
- Included in every log entry
- Returned in response headers (`X-Request-ID`)
- Stored in database records where applicable

This enables full request tracing: from eligibility check → decision → checkout → partner request → callback → state transition.

### 5.2 Decision Trace

For any `decision_id`, an operator can reconstruct the full journey:

1. **Eligibility check** — all 5 rules, inputs, results, overall decision
2. **Recovery options** — what was offered, what was accepted
3. **Checkout attempt** — state transitions with timestamps
4. **Partner requests** — each attempt, response, retry count
5. **Callbacks** — all callbacks received, duplicate/late flags
6. **Final state** — terminal checkout status

This trace is available via `GET /api/dashboard/decisions/{decision_id}` which includes linked checkout and callback data.

---

## 6. Prototype Implementation

### 6.1 What the Prototype Implements

| Capability | Implementation |
|------------|---------------|
| Structured logging | Python `logging` module with JSON formatter |
| Request ID | UUID generated per request, propagated via FastAPI middleware |
| Key business events | INFO-level logs for decisions, state transitions, callbacks |
| Metrics computation | Computed on-the-fly from database queries (dashboard endpoints) |
| Health status | `GET /api/dashboard/checkouts/health` with green/yellow/red thresholds |
| Decision trace | `GET /api/dashboard/decisions/{id}` with linked checkout/callback data |

### 6.2 What Production Adds

| Capability | Production Implementation |
|------------|--------------------------|
| Metrics export | OpenTelemetry SDK → Prometheus/Datadog/CloudWatch |
| Distributed tracing | OpenTelemetry traces with span context propagation |
| Alerting | PagerDuty/Opsgenie integration with alert rules from §3 |
| Dashboard | Grafana/Datadog dashboards with panels from §4.2 |
| Log aggregation | Centralized logging (Datadog Logs, CloudWatch Logs, ELK) |
| Anomaly detection | ML-based anomaly detection on approval rate, latency, error rate |
| SLO tracking | Error budget tracking for checkout completion and callback processing |

### 6.3 Mapping: Kill/Iterate/Scale → Metrics

The kill/iterate/scale criteria from PRD §15 map directly to the metrics defined in this plan:

| PRD Criterion | Metric | Threshold | Alert |
|---------------|--------|-----------|-------|
| "Approval rate drops below 20% for 3 consecutive days" | `eligibility.approval_rate` | < 20% sustained | P2: Approval Rate Drift |
| "Checkout failure rate exceeds 10% for 2 consecutive days" | `checkout.failure_rate` | > 10% sustained | P1: Checkout Failure Spike |
| "Partner callback success rate drops below 95%" | `webhook.callback.success_rate` | < 95% | P2: implicit from callback metrics |
| "Approval rate is 30–70% and stable for 7 days" | `eligibility.approval_rate` | 30–70% | Scale criterion (no alert — positive signal) |
| "Checkout completion rate exceeds 70% of approved users" | `checkout.completion_rate` | > 70% | Scale criterion (no alert) |
| "Zero untraced decisions and zero silent failures for 7 days" | Decision audit completeness + `checkout.failure_rate` | 0 / < threshold | Scale criterion |
