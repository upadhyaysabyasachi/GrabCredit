"""Eligibility decision engine.

Evaluates all 5 rules, generates reason codes, risk signals,
EMI terms (if approved), and recovery options (if declined).
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from config import get_settings, get_supabase
from models import (
    Decision,
    EligibilityCheckResponse,
    EMIOption,
    EMITerms,
    ReasonCode,
    RecoveryOption,
    RecoveryType,
    RuleResult,
)
from eligibility.rules import (
    check_kyc_status,
    check_credit_tier,
    check_cart_value_limit,
    check_merchant_eligibility,
    check_velocity,
)

logger = logging.getLogger("grabcredit.eligibility")


def calculate_emi(amount: float) -> EMITerms:
    """Calculate EMI options for a given amount using simplified flat-rate formula."""
    settings = get_settings()
    rate = settings.EMI_MONTHLY_RATE
    options = []
    for tenure in settings.EMI_TENURE_OPTIONS:
        total = amount * (1 + rate * tenure)
        monthly = round(total / tenure, 2)
        options.append(
            EMIOption(
                tenure_months=tenure,
                monthly_emi=monthly,
                interest_rate=rate * 100,  # as percentage
                total_amount=round(total, 2),
            )
        )
    return EMITerms(options=options)


def generate_recovery_options(
    reason_codes: list[str], user: dict, cart_value: float
) -> list[RecoveryOption] | None:
    """Generate recovery options for declined decisions.

    Rules:
    - PARTIAL_BNPL only when CART_VALUE_EXCEEDS_LIMIT is the SOLE failure
    - VELOCITY_LIMIT_EXCEEDED gets NO recovery options
    - Each other failure type gets its own recovery option
    """
    if not reason_codes:
        return None

    # No recovery for velocity abuse
    if ReasonCode.VELOCITY_LIMIT_EXCEEDED in reason_codes:
        if len(reason_codes) == 1:
            return None
        # Filter out velocity from recovery generation, but still no partial BNPL
        codes_for_recovery = [
            c for c in reason_codes if c != ReasonCode.VELOCITY_LIMIT_EXCEEDED
        ]
    else:
        codes_for_recovery = reason_codes

    if not codes_for_recovery:
        return None

    options = []
    settings = get_settings()

    for code in codes_for_recovery:
        if code == ReasonCode.CART_VALUE_EXCEEDS_LIMIT:
            # Partial BNPL only when this is the SOLE failing rule
            if len(reason_codes) == 1:
                limit = float(user.get("max_bnpl_limit", 0))
                upfront = cart_value - limit
                if upfront >= settings.MIN_PARTIAL_UPFRONT:
                    emi_terms = calculate_emi(limit)
                    options.append(
                        RecoveryOption(
                            type=RecoveryType.PARTIAL_BNPL,
                            upfront_amount=round(upfront, 2),
                            bnpl_amount=round(limit, 2),
                            emi_terms=emi_terms,
                            message=f"Pay \u20b9{upfront:,.0f} upfront and split \u20b9{limit:,.0f} into EMIs",
                            cta_label=f"Pay \u20b9{upfront:,.0f} now + EMI",
                            cta_action="initiate_split_checkout",
                        )
                    )

        elif code == ReasonCode.KYC_INCOMPLETE:
            options.append(
                RecoveryOption(
                    type=RecoveryType.INLINE_KYC,
                    message="Complete your KYC verification to unlock BNPL.",
                    cta_label="Complete KYC",
                    cta_action="open_kyc_flow",
                )
            )

        elif code == ReasonCode.CREDIT_TIER_INSUFFICIENT:
            options.append(
                RecoveryOption(
                    type=RecoveryType.UPGRADE_PATH,
                    message="Your account needs a higher trust level for BNPL. Complete 3 more transactions to unlock.",
                    cta_label="Learn How to Upgrade",
                    cta_action="show_upgrade_info",
                )
            )

        elif code == ReasonCode.MERCHANT_NOT_ELIGIBLE:
            options.append(
                RecoveryOption(
                    type=RecoveryType.ALT_DEALS,
                    message="BNPL is not available for this merchant yet. Check similar deals from BNPL-enabled merchants.",
                    cta_label="View Similar Deals",
                    cta_action="show_alt_deals",
                )
            )

    return options if options else None


def get_velocity_count(user_id: str) -> int:
    """Count eligibility checks for user in the last 60 minutes."""
    db = get_supabase()
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    result = (
        db.table("velocity_events")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .gte("created_at", one_hour_ago)
        .execute()
    )
    return result.count or 0


def get_velocity_retry_minutes(user_id: str) -> int:
    """Calculate minutes until the oldest velocity event in the window expires.

    Returns the number of minutes the user must wait before their oldest
    check rolls off the 1-hour window, freeing up a slot.
    """
    db = get_supabase()
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    result = (
        db.table("velocity_events")
        .select("created_at")
        .eq("user_id", user_id)
        .gte("created_at", one_hour_ago)
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    if not result.data:
        return 0
    oldest = datetime.fromisoformat(result.data[0]["created_at"].replace("Z", "+00:00"))
    expires_at = oldest + timedelta(hours=1)
    remaining = (expires_at - datetime.now(timezone.utc)).total_seconds()
    return max(1, int(remaining / 60) + 1)


def record_velocity_event(user_id: str, event_type: str = "eligibility_check"):
    """Record a velocity event for the user."""
    db = get_supabase()
    db.table("velocity_events").insert(
        {"user_id": user_id, "event_type": event_type}
    ).execute()


def run_eligibility_check(
    user_id: str,
    merchant_id: str,
    cart_value: float,
    deal_id: str | None = None,
) -> EligibilityCheckResponse:
    """Run the full eligibility check pipeline.

    1. Fetch user and merchant from DB
    2. Record velocity event (before evaluation)
    3. Run all 5 rules
    4. Generate decision, EMI terms, recovery options
    5. Persist decision to DB
    6. Return structured response
    """
    db = get_supabase()
    settings = get_settings()

    # Fetch user
    user_result = db.table("users").select("*").eq("id", user_id).execute()
    if not user_result.data:
        raise ValueError(f"User not found: {user_id}")
    user = user_result.data[0]

    # Fetch merchant
    merchant_result = db.table("merchants").select("*").eq("id", merchant_id).execute()
    if not merchant_result.data:
        raise ValueError(f"Merchant not found: {merchant_id}")
    merchant = merchant_result.data[0]

    # Get velocity count BEFORE recording this check
    velocity_count = get_velocity_count(user_id)

    # Record velocity event AFTER counting (so this check itself doesn't count against the limit)
    record_velocity_event(user_id)

    # Run ALL 5 rules — collect all results
    risk_signals: dict[str, RuleResult] = {}
    reason_codes: list[str] = []

    r1_result, r1_code = check_kyc_status(user)
    risk_signals["kyc_status"] = r1_result
    if r1_code:
        reason_codes.append(r1_code)

    r2_result, r2_code = check_credit_tier(user)
    risk_signals["credit_tier"] = r2_result
    if r2_code:
        reason_codes.append(r2_code)

    r3_result, r3_code = check_cart_value_limit(cart_value, user)
    risk_signals["cart_value_limit"] = r3_result
    if r3_code:
        reason_codes.append(r3_code)

    r4_result, r4_code = check_merchant_eligibility(merchant)
    risk_signals["merchant_eligibility"] = r4_result
    if r4_code:
        reason_codes.append(r4_code)

    r5_result, r5_code = check_velocity(velocity_count, settings.VELOCITY_LIMIT_PER_HOUR)
    if r5_code:
        # Enrich velocity signal with retry timing
        retry_minutes = get_velocity_retry_minutes(user_id)
        r5_result = RuleResult(
            rule="R5",
            input={
                "checks_in_hour": velocity_count,
                "limit": settings.VELOCITY_LIMIT_PER_HOUR,
                "retry_after_minutes": retry_minutes,
            },
            result="FAIL",
        )
    risk_signals["velocity_check"] = r5_result
    if r5_code:
        reason_codes.append(r5_code)

    # Determine decision
    decision = Decision.APPROVED if not reason_codes else Decision.DECLINED

    # EMI terms (only for approved)
    emi_terms = calculate_emi(cart_value) if decision == Decision.APPROVED else None

    # Recovery options (only for declined)
    recovery_options = (
        generate_recovery_options(reason_codes, user, cart_value)
        if decision == Decision.DECLINED
        else None
    )

    # Timestamps
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.DECISION_EXPIRY_MINUTES)

    # Persist to database
    decision_data = {
        "user_id": user_id,
        "merchant_id": merchant_id,
        "cart_value": cart_value,
        "decision": decision.value,
        "reason_codes": reason_codes,
        "risk_signals": {
            k: v.model_dump() for k, v in risk_signals.items()
        },
        "emi_terms": emi_terms.model_dump() if emi_terms else None,
        "recovery_options": (
            [opt.model_dump() for opt in recovery_options]
            if recovery_options
            else None
        ),
        "expires_at": expires_at.isoformat(),
    }
    if deal_id:
        decision_data["deal_id"] = deal_id

    insert_result = db.table("eligibility_decisions").insert(decision_data).execute()
    saved = insert_result.data[0]

    logger.info(
        f"Eligibility check: user={user_id}, decision={decision.value}, "
        f"reason_codes={reason_codes}, cart_value={cart_value}"
    )

    return EligibilityCheckResponse(
        decision_id=saved["id"],
        user_id=user_id,
        merchant_id=merchant_id,
        cart_value=cart_value,
        decision=decision,
        reason_codes=reason_codes,
        risk_signals=risk_signals,
        emi_terms=emi_terms,
        recovery_options=recovery_options,
        expires_at=expires_at,
        created_at=saved["created_at"],
    )
