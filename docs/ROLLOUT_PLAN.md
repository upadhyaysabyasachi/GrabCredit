# Rollout Plan — GrabCredit

## Gating, Rollback, and Kill/Iterate/Scale Strategy

| Field | Value |
|-------|-------|
| **Author** | GrabOn Engineering |
| **Version** | 1.0 |
| **Date** | March 2026 |
| **Status** | DRAFT |

---

## 1. Rollout Phases

GrabCredit BNPL rolls out in four phases, each gated by explicit success criteria. No phase advances without all gate conditions being met.

| Phase | Traffic | Duration | Description |
|-------|---------|----------|-------------|
| **Canary** | 1% of eligible users | 3 days minimum | Validate core flows with real traffic. Manual review of every failure. |
| **Limited** | 5% of eligible users | 5 days minimum | Validate at modest scale. Automated alerts active. Daily ops review. |
| **Expanded** | 25% of eligible users | 7 days minimum | Validate partner capacity and system stability under meaningful load. |
| **GA** | 100% of eligible users | Ongoing | Full availability. Continuous monitoring against kill/iterate/scale criteria. |

### Phase Gate Criteria

Each phase must meet ALL of the following before advancing to the next:

| Criterion | Canary → Limited | Limited → Expanded | Expanded → GA |
|-----------|-----------------|-------------------|---------------|
| Approval rate | 30–70% and stable | 30–70% and stable | 30–70% for 7 consecutive days |
| Checkout completion rate | > 50% of approved | > 60% of approved | > 70% of approved |
| Checkout failure rate | < 10% | < 10% | < 5% |
| Callback success rate | > 95% | > 99% | > 99.5% |
| Silent failures | Zero | Zero | Zero for 7 days |
| Untraced decisions | Zero | Zero | Zero for 7 days |
| P1 incidents | Zero | Zero in last 3 days | Zero in last 14 days |
| Ops sign-off | Dashboard reviewed | Dashboard actively used | Formal sign-off |

---

## 2. Gating Mechanism

### 2.1 Feature Flag

- **Flag name:** `grabcredit_bnpl_enabled`
- **Type:** Boolean per user segment (percentage-based rollout)
- **Implementation:**
  - Prototype: configuration value in backend `config.py`, defaulting to `true` for all users (prototype operates at 100%)
  - Production: feature flag service (LaunchDarkly, Unleash, or equivalent) with percentage-based targeting

### 2.2 Traffic Routing

- When `grabcredit_bnpl_enabled = false` for a user, the eligibility check endpoint returns:
  ```json
  {
      "available": false,
      "message": "BNPL is not currently available for your account."
  }
  ```
- No rules evaluation occurs. No velocity event logged. No decision persisted.

### 2.3 Merchant Gating

- BNPL only available for merchants with `bnpl_enabled = true` in the database.
- Merchant opt-in is independent of user-level feature flag.
- New merchant onboarding requires: merchant agreement, category review, and fraud risk assessment.

### 2.4 User Eligibility Pre-Check

- Before showing the "Check BNPL" button, the frontend checks the feature flag status.
- Users who are not in the rollout cohort never see BNPL as an option — no confusion, no dead-end UX.

---

## 3. Kill Switch

### 3.1 Activation

The kill switch immediately disables all new BNPL activity:

| Action | Method | Time to Effect |
|--------|--------|---------------|
| Disable BNPL globally | Set `grabcredit_bnpl_enabled = false` for all segments | < 1 minute |
| Disable for specific merchant | Set `merchant.bnpl_enabled = false` in database | < 1 minute |
| Disable for specific user segment | Update feature flag targeting rules | < 2 minutes |

### 3.2 Behavior When Kill Switch Active

- **New eligibility checks:** Return `{ available: false }` — no rules evaluation.
- **New checkout initiations:** Blocked. Return `{ error: "BNPL is temporarily unavailable" }`.
- **In-flight checkouts (INITIATED or PENDING):** Allowed to reach terminal state naturally. Do NOT cancel mid-flight — this could leave partner-side transactions in inconsistent state.
- **Callbacks for in-flight checkouts:** Continue to be processed normally.
- **Dashboard:** Remains fully functional for investigating the incident.

### 3.3 Kill Switch Triggers

Activate the kill switch immediately if ANY of the following occur:

| Trigger | Threshold | Detection |
|---------|-----------|-----------|
| Checkout failure rate spike | > 15% for 5 minutes | Automated alert (P1) |
| Partner callback blackout | Zero callbacks for 10 minutes during active checkouts | Automated alert (P1) |
| Approval rate anomaly | < 10% or > 90% for 1 hour | Automated alert (P1) |
| Data integrity issue | Untraced decisions or orphan checkouts detected | Ops manual check |
| Partner escalation | Payment partner reports integration issue | Partner communication channel |
| Security incident | Unauthorized callback or state manipulation detected | Security monitoring |

---

## 4. Rollback Procedure

### 4.1 Step-by-Step Rollback

| Step | Action | Owner | Target Time | Verification |
|------|--------|-------|------------|-------------|
| 1 | Activate kill switch (set feature flag to false) | On-call engineer | < 1 minute | Verify no new eligibility checks succeed |
| 2 | Verify kill switch effective | On-call engineer | < 2 minutes | Hit eligibility endpoint, confirm `{ available: false }` |
| 3 | Monitor in-flight checkouts | Automatic | < 5 minutes | Dashboard shows PENDING count dropping to zero |
| 4 | Notify ops team | On-call engineer | < 5 minutes | Slack/PagerDuty notification with incident summary |
| 5 | Notify product team | On-call engineer | < 10 minutes | Email/Slack with impact assessment |
| 6 | Root cause analysis | Engineering team | < 24 hours | Incident report with timeline, root cause, remediation |
| 7 | Fix and test | Engineering team | Variable | Fix deployed to staging, all 11 E2E scenarios pass |
| 8 | Re-enable at previous phase | Engineering + Product | After RCA complete | Resume rollout at the phase BEFORE the incident |

### 4.2 Rollback Decision Authority

| Severity | Who Can Trigger Rollback | Approval Needed |
|----------|------------------------|-----------------|
| P1 (system down, data integrity) | Any on-call engineer | No approval needed — act first, inform after |
| P2 (degraded performance, high error rate) | On-call engineer | Notify engineering lead within 30 minutes |
| P3 (metric drift, non-urgent anomaly) | Engineering lead | Discuss with product before rollback |

### 4.3 Post-Rollback Checklist

- [ ] Kill switch confirmed active
- [ ] All in-flight checkouts reached terminal state
- [ ] Ops team notified
- [ ] Product team notified
- [ ] Partner notified (if partner-side impact)
- [ ] Incident timeline documented
- [ ] Root cause identified
- [ ] Fix implemented and tested
- [ ] Regression test suite passes (all 11 scenarios)
- [ ] Post-mortem scheduled (within 48 hours)

---

## 5. Monitoring During Rollout

### 5.1 Metrics to Watch

Reference: `OBSERVABILITY_PLAN.md` for full metric definitions and alert thresholds.

| Metric | Canary Monitoring | Limited Monitoring | Expanded Monitoring |
|--------|------------------|-------------------|-------------------|
| Approval rate | Manual check every 4 hours | Automated alert | Automated alert |
| Checkout failure rate | Manual review of every failure | Automated alert, daily review | Automated alert only |
| Callback success rate | Manual check every 4 hours | Automated alert | Automated alert |
| Timeout rate | Manual check | Automated alert if > 5% | Automated alert if > 2% |
| Duplicate callback rate | Manual check | Automated alert if > 5% | Automated alert if > 3% |
| Eligibility latency p95 | Manual check | Automated alert if > 500ms | Automated alert if > 500ms |

### 5.2 Daily Rollout Review (Canary & Limited)

During Canary and Limited phases, a daily 15-minute review meeting covers:

1. Metric summary vs. gate criteria
2. Any failures or anomalies in the last 24 hours
3. User feedback (if any)
4. Decision: continue, hold, or rollback

Attendees: Engineering lead, Product owner, Ops representative.

### 5.3 Weekly Rollout Review (Expanded)

During the Expanded phase, a weekly review covers:

1. 7-day metric trends
2. Partner performance and SLA adherence
3. Ops dashboard usage and feedback
4. Decision: advance to GA or continue at 25%

---

## 6. Partner Communication

### 6.1 Pre-Rollout

| Item | Timeline | Owner |
|------|----------|-------|
| Share rollout schedule with partner | 2 weeks before canary | Engineering lead |
| Confirm callback SLA (response within 5 minutes) | 1 week before canary | Engineering lead |
| Share expected TPS ramp per phase | 1 week before canary | Engineering lead |
| Establish incident escalation channel | Before canary | Both sides |
| Confirm sandbox testing complete | Before canary | Engineering |

### 6.2 Expected Traffic Ramp

| Phase | Estimated Eligibility Checks/day | Estimated Checkouts/day | Estimated TPS (peak) |
|-------|--------------------------------|------------------------|---------------------|
| Canary (1%) | ~100 | ~30 | < 1 |
| Limited (5%) | ~500 | ~150 | < 1 |
| Expanded (25%) | ~2,500 | ~750 | ~1 |
| GA (100%) | ~10,000 | ~3,000 | ~5 |

*Estimates based on projected GrabOn deal redemption volume. Actual numbers validated during each phase.*

### 6.3 During Rollout

- Notify partner before each phase advancement (24 hours notice).
- Share weekly traffic report with actual vs. projected volumes.
- Immediate notification if kill switch activated or partner-side issue detected.

### 6.4 Incident Escalation

| Severity | GrabCredit Action | Partner Action | SLA |
|----------|------------------|----------------|-----|
| P1 — Partner down | Activate kill switch, notify partner | Investigate, provide ETA | Acknowledge within 15 minutes |
| P2 — Degraded | Monitor, prepare for kill switch | Investigate | Acknowledge within 1 hour |
| P3 — Minor | Log for review | Best effort | Next business day |

---

## 7. Success Criteria for GA

All of the following must be met for 7 consecutive days at 25% traffic before advancing to GA:

| Criterion | Target | Source |
|-----------|--------|--------|
| BNPL approval rate | 30–70% (stable) | PRD §3: Guardrails |
| Checkout completion rate | > 70% of approved users | PRD §3: Success Metrics |
| Eligibility check latency (p95) | < 500ms | PRD §3: Success Metrics |
| Callback processing success rate | > 99.5% | PRD §3: Success Metrics |
| Duplicate callback dedup rate | 100% | PRD §3: Success Metrics |
| Decision explainability coverage | 100% (all decisions have reason codes) | PRD §3: Success Metrics |
| Checkout failure rate | < 5% | Kill criteria inverse |
| Untraced decisions | Zero | PRD §3: Guardrails |
| Silent checkout failures | Zero | PRD §3: Guardrails |
| P1 incidents | Zero in last 14 days | Operational stability |
| Ops team sign-off | Dashboard actively used for daily monitoring | Operational readiness |
| Product team sign-off | Metrics reviewed and approved | Business readiness |

---

## 8. Prototype vs. Production Rollout

| Aspect | Prototype | Production |
|--------|-----------|------------|
| Feature flag | Config value, always `true` | Feature flag service with percentage targeting |
| Traffic routing | All test users see BNPL | Percentage-based with user segment targeting |
| Kill switch | Toggle config, restart server | Feature flag update, < 1 minute, no restart |
| Monitoring | Manual + operator dashboard | Automated alerts + Grafana/Datadog dashboards |
| Partner communication | N/A (mock partner) | Formal schedule, escalation channel, SLA |
| Rollback | N/A (development environment) | Documented procedure with time targets |
| Phase gates | N/A (all scenarios tested manually) | Automated metric validation |
