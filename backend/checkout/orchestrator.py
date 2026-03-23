"""Checkout orchestrator.

Handles checkout initiation, partner dispatch, and the background timeout job.
"""

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone

from config import get_settings, get_supabase
from models import CheckoutStatus, PartnerBehavior
from checkout.state_machine import can_transition, is_terminal

logger = logging.getLogger("grabcredit.checkout")


def create_checkout(
    decision_id: str,
    amount: float,
    emi_tenure_months: int,
    partner_behavior: PartnerBehavior,
    is_partial_bnpl: bool = False,
) -> dict:
    """Create a new checkout attempt in INITIATED state.

    Returns the created checkout record.
    """
    db = get_supabase()
    settings = get_settings()

    # Validate decision exists and is not expired
    decision_result = (
        db.table("eligibility_decisions").select("*").eq("id", decision_id).execute()
    )
    if not decision_result.data:
        raise ValueError("DECISION_NOT_FOUND")

    decision = decision_result.data[0]

    # Check expiry
    expires_at = datetime.fromisoformat(decision["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        raise ValueError("DECISION_EXPIRED")

    # Check decision is APPROVED (or DECLINED with partial BNPL recovery)
    if decision["decision"] != "APPROVED" and not is_partial_bnpl:
        raise ValueError("DECISION_NOT_APPROVED")

    # Check no existing checkout for this decision
    existing = (
        db.table("checkout_attempts")
        .select("id")
        .eq("decision_id", decision_id)
        .execute()
    )
    if existing.data:
        raise ValueError("CHECKOUT_ALREADY_EXISTS")

    # Generate idempotency key
    timestamp_ms = int(time.time() * 1000)
    idempotency_key = f"grabcredit_{decision_id}_{timestamp_ms}"

    # Use decision cart_value if amount not specified
    if amount is None:
        amount = float(decision["cart_value"])

    # Create checkout record
    checkout_data = {
        "decision_id": decision_id,
        "idempotency_key": idempotency_key,
        "status": CheckoutStatus.INITIATED.value,
        "amount": amount,
        "is_partial_bnpl": is_partial_bnpl,
        "partner_behavior": partner_behavior.value,
        "emi_tenure_months": emi_tenure_months,
        "retry_count": 0,
    }

    result = db.table("checkout_attempts").insert(checkout_data).execute()
    checkout = result.data[0]

    logger.info(
        f"Checkout created: id={checkout['id']}, decision={decision_id}, "
        f"amount={amount}, behavior={partner_behavior.value}"
    )

    return checkout


def update_checkout_status(
    checkout_id: str,
    new_status: CheckoutStatus,
    partner_ref: str | None = None,
    error_detail: str | None = None,
    retry_count: int | None = None,
) -> dict | None:
    """Update checkout status with state machine validation.

    Uses WHERE status != terminal to prevent race conditions.
    Returns updated record or None if transition was blocked.
    """
    db = get_supabase()

    # Fetch current state
    result = (
        db.table("checkout_attempts").select("*").eq("id", checkout_id).execute()
    )
    if not result.data:
        return None

    current = result.data[0]
    current_status = CheckoutStatus(current["status"])

    if not can_transition(current_status, new_status):
        logger.warning(
            f"Invalid transition blocked: {current_status.value} -> {new_status.value} "
            f"for checkout={checkout_id}"
        )
        return None

    update_data: dict = {"status": new_status.value}
    if partner_ref is not None:
        update_data["partner_ref"] = partner_ref
    if error_detail is not None:
        update_data["error_detail"] = error_detail
    if retry_count is not None:
        update_data["retry_count"] = retry_count

    # Atomic update: only update if still in expected state
    updated = (
        db.table("checkout_attempts")
        .update(update_data)
        .eq("id", checkout_id)
        .eq("status", current_status.value)
        .execute()
    )

    if not updated.data:
        logger.warning(f"Race condition: checkout {checkout_id} state changed before update")
        return None

    logger.info(
        f"State transition: checkout={checkout_id}, "
        f"{current_status.value} -> {new_status.value}"
    )

    return updated.data[0]


async def dispatch_to_partner(checkout: dict):
    """Dispatch checkout to mock partner and handle the async flow.

    This function:
    1. Transitions to PENDING
    2. Calls the mock partner (which sends callbacks asynchronously)
    3. Handles retries for transient failures
    """
    import httpx
    from config import get_settings

    settings = get_settings()
    checkout_id = checkout["id"]
    behavior = checkout.get("partner_behavior", "success")
    idempotency_key = checkout["idempotency_key"]

    # Transition to PENDING
    update_checkout_status(checkout_id, CheckoutStatus.PENDING)

    # Build partner request
    partner_url = f"{settings.BACKEND_URL}/api/webhook/mock-partner-request"
    payload = {
        "idempotency_key": idempotency_key,
        "checkout_id": checkout_id,
        "user_id": None,  # filled below
        "merchant_id": None,
        "amount": float(checkout["amount"]),
        "currency": "INR",
        "emi_tenure_months": checkout.get("emi_tenure_months", 3),
        "callback_url": f"{settings.BACKEND_URL}/api/webhook/partner-callback",
        "partner_behavior": behavior,
    }

    # Fetch decision for user/merchant context
    db = get_supabase()
    decision = (
        db.table("eligibility_decisions")
        .select("user_id, merchant_id")
        .eq("id", checkout["decision_id"])
        .execute()
    )
    if decision.data:
        payload["user_id"] = decision.data[0]["user_id"]
        payload["merchant_id"] = decision.data[0]["merchant_id"]

    # Retry logic with exponential backoff
    backoff_times = [1, 2, 4]  # seconds
    max_retries = settings.MAX_PARTNER_RETRIES
    retry_count = 0

    async with httpx.AsyncClient(timeout=10.0) as client:
        for attempt in range(max_retries):
            try:
                response = await client.post(partner_url, json=payload)

                if response.status_code == 200:
                    # Partner acknowledged — callback will come async
                    retry_count = attempt
                    break
                elif 400 <= response.status_code < 500:
                    # 4xx: do NOT retry, mark FAILED immediately
                    update_checkout_status(
                        checkout_id,
                        CheckoutStatus.FAILED,
                        error_detail=f"Partner returned {response.status_code}",
                        retry_count=attempt,
                    )
                    return
                elif response.status_code >= 500:
                    # 5xx: retry with backoff
                    retry_count = attempt + 1
                    if attempt < max_retries - 1:
                        backoff = backoff_times[attempt]
                        logger.warning(
                            f"Partner 5xx for checkout={checkout_id}, "
                            f"attempt={attempt + 1}, retrying in {backoff}s"
                        )
                        # Update retry count
                        db.table("checkout_attempts").update(
                            {"retry_count": retry_count}
                        ).eq("id", checkout_id).execute()
                        await asyncio.sleep(backoff)
                    else:
                        # All retries exhausted
                        update_checkout_status(
                            checkout_id,
                            CheckoutStatus.FAILED,
                            error_detail=f"Partner 5xx after {max_retries} attempts",
                            retry_count=retry_count,
                        )
                        return

            except httpx.TimeoutException:
                retry_count = attempt + 1
                if attempt < max_retries - 1:
                    backoff = backoff_times[attempt]
                    logger.warning(
                        f"Partner timeout for checkout={checkout_id}, "
                        f"attempt={attempt + 1}, retrying in {backoff}s"
                    )
                    db.table("checkout_attempts").update(
                        {"retry_count": retry_count}
                    ).eq("id", checkout_id).execute()
                    await asyncio.sleep(backoff)
                else:
                    update_checkout_status(
                        checkout_id,
                        CheckoutStatus.FAILED,
                        error_detail=f"Partner timeout after {max_retries} attempts",
                        retry_count=retry_count,
                    )
                    return

            except Exception as e:
                logger.error(f"Partner request error for checkout={checkout_id}: {e}")
                update_checkout_status(
                    checkout_id,
                    CheckoutStatus.FAILED,
                    error_detail=str(e),
                    retry_count=attempt,
                )
                return


async def run_timeout_job():
    """Background job that transitions stale PENDING checkouts to TIMED_OUT.

    Runs every 30 seconds. Uses atomic UPDATE with WHERE status='PENDING'
    to handle race conditions with late callbacks.
    """
    settings = get_settings()
    logger.info("Timeout job started")

    while True:
        try:
            await asyncio.sleep(30)

            db = get_supabase()
            cutoff = (
                datetime.now(timezone.utc)
                - timedelta(minutes=settings.CHECKOUT_TIMEOUT_MINUTES)
            ).isoformat()

            # Find stale PENDING checkouts
            stale = (
                db.table("checkout_attempts")
                .select("id")
                .eq("status", CheckoutStatus.PENDING.value)
                .lt("created_at", cutoff)
                .execute()
            )

            for checkout in stale.data or []:
                # Atomic transition — only succeeds if still PENDING
                updated = (
                    db.table("checkout_attempts")
                    .update({"status": CheckoutStatus.TIMED_OUT.value})
                    .eq("id", checkout["id"])
                    .eq("status", CheckoutStatus.PENDING.value)
                    .execute()
                )
                if updated.data:
                    logger.info(f"Timeout: checkout={checkout['id']} -> TIMED_OUT")

        except asyncio.CancelledError:
            logger.info("Timeout job cancelled")
            break
        except Exception as e:
            logger.error(f"Timeout job error: {e}")
