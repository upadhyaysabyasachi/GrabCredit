"""Individual eligibility rule implementations.

Each rule takes context and returns a RuleResult with PASS or FAIL.
All 5 rules MUST run regardless of earlier failures.
"""

from models import RuleResult, ReasonCode


def check_kyc_status(user: dict) -> tuple[RuleResult, str | None]:
    """R1: User must have completed KYC verification."""
    kyc_status = user.get("kyc_status", "incomplete")
    passed = kyc_status == "completed"
    result = RuleResult(
        rule="R1",
        input=kyc_status,
        result="PASS" if passed else "FAIL",
    )
    return result, None if passed else ReasonCode.KYC_INCOMPLETE


def check_credit_tier(user: dict) -> tuple[RuleResult, str | None]:
    """R2: User's credit tier must be SILVER or above."""
    tier = user.get("credit_tier", "BRONZE")
    qualifying_tiers = {"SILVER", "GOLD", "PLATINUM"}
    passed = tier in qualifying_tiers
    result = RuleResult(
        rule="R2",
        input=tier,
        result="PASS" if passed else "FAIL",
    )
    return result, None if passed else ReasonCode.CREDIT_TIER_INSUFFICIENT


def check_cart_value_limit(cart_value: float, user: dict) -> tuple[RuleResult, str | None]:
    """R3: Cart total must not exceed user's approved BNPL limit."""
    limit = float(user.get("max_bnpl_limit", 0))
    passed = cart_value <= limit
    result = RuleResult(
        rule="R3",
        input={"cart": cart_value, "limit": limit},
        result="PASS" if passed else "FAIL",
    )
    return result, None if passed else ReasonCode.CART_VALUE_EXCEEDS_LIMIT


def check_merchant_eligibility(merchant: dict) -> tuple[RuleResult, str | None]:
    """R4: Merchant must be enrolled in the BNPL program."""
    bnpl_enabled = merchant.get("bnpl_enabled", False)
    passed = bnpl_enabled is True
    result = RuleResult(
        rule="R4",
        input=bnpl_enabled,
        result="PASS" if passed else "FAIL",
    )
    return result, None if passed else ReasonCode.MERCHANT_NOT_ELIGIBLE


def check_velocity(checks_in_hour: int, limit: int) -> tuple[RuleResult, str | None]:
    """R5: User must have fewer than `limit` checks in the rolling 1-hour window."""
    passed = checks_in_hour < limit
    result = RuleResult(
        rule="R5",
        input={"checks_in_hour": checks_in_hour, "limit": limit},
        result="PASS" if passed else "FAIL",
    )
    return result, None if passed else ReasonCode.VELOCITY_LIMIT_EXCEEDED
