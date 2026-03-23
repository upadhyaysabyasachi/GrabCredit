"""Webhook callback handler.

Processes partner callbacks with:
- Payload validation
- Idempotency check (duplicate detection)
- State transition
- Full logging to callback_logs
"""

import logging
from datetime import datetime, timezone

from config import get_supabase
from models import CheckoutStatus, CallbackStatus
from checkout.state_machine import is_terminal

logger = logging.getLogger("grabcredit.webhook")


def process_callback(payload: dict) -> dict:
    """Process a partner callback.

    Returns a response dict with received status and duplicate flag.
    Raises ValueError for invalid payloads or unknown checkouts.
    """
    db = get_supabase()
    idempotency_key = payload.get("idempotency_key")

    if not idempotency_key:
        raise ValueError("Missing idempotency_key")

    # Look up checkout by idempotency key
    checkout_result = (
        db.table("checkout_attempts")
        .select("*")
        .eq("idempotency_key", idempotency_key)
        .execute()
    )

    if not checkout_result.data:
        # Orphan callback — unknown checkout
        logger.warning(f"Orphan callback: key={idempotency_key}")
        raise ValueError("Unknown idempotency key")

    checkout = checkout_result.data[0]
    checkout_id = checkout["id"]
    current_status = CheckoutStatus(checkout["status"])

    # Check for duplicate: has this idempotency_key been processed before?
    existing_callbacks = (
        db.table("callback_logs")
        .select("id")
        .eq("idempotency_key", idempotency_key)
        .eq("is_duplicate", False)
        .execute()
    )

    is_duplicate = len(existing_callbacks.data) > 0

    # Check if callback is late (checkout already in terminal state)
    is_late = is_terminal(current_status)

    # Log the callback
    callback_log = {
        "checkout_id": checkout_id,
        "idempotency_key": idempotency_key,
        "raw_payload": payload,
        "is_duplicate": is_duplicate,
        "is_late": is_late,
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }
    db.table("callback_logs").insert(callback_log).execute()

    if is_duplicate:
        logger.warning(f"Duplicate callback: key={idempotency_key}, checkout={checkout_id}")
        return {"received": True, "is_duplicate": True}

    if is_late:
        logger.warning(
            f"Late callback: key={idempotency_key}, checkout={checkout_id}, "
            f"current_status={current_status.value}"
        )
        return {"received": True, "is_duplicate": False}

    # Map partner status to checkout status
    partner_status = payload.get("status", "").lower()
    partner_ref = payload.get("partner_ref")
    decline_reason = payload.get("decline_reason")
    error_code = payload.get("error_code")

    if partner_status == "success":
        new_status = CheckoutStatus.SUCCESS
        error_detail = None
    elif partner_status == "declined":
        new_status = CheckoutStatus.DECLINED
        error_detail = decline_reason
    elif partner_status == "error":
        new_status = CheckoutStatus.FAILED
        error_detail = error_code
    else:
        logger.error(f"Unknown partner status: {partner_status}")
        raise ValueError(f"Invalid callback status: {partner_status}")

    # Transition checkout state (atomic — only if still in expected state)
    update_data = {"status": new_status.value}
    if partner_ref:
        update_data["partner_ref"] = partner_ref
    if error_detail:
        update_data["error_detail"] = error_detail

    updated = (
        db.table("checkout_attempts")
        .update(update_data)
        .eq("id", checkout_id)
        .eq("status", current_status.value)
        .execute()
    )

    if updated.data:
        logger.info(
            f"Callback processed: key={idempotency_key}, "
            f"{current_status.value} -> {new_status.value}"
        )
    else:
        logger.warning(
            f"Callback state transition blocked: key={idempotency_key}, "
            f"checkout may have changed state"
        )

    return {"received": True, "is_duplicate": False}
