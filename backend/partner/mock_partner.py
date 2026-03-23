"""Mock PayU/LazyPay partner service.

Runs within the FastAPI app. Accepts checkout requests and sends callbacks
after a configurable delay. Supports: success, decline, transient_failure,
timeout, and duplicate modes.
"""

import asyncio
import logging
import random
import string
from datetime import datetime, timezone

import httpx

logger = logging.getLogger("grabcredit.mock_partner")

# Track request counts per idempotency key for transient failure simulation
_request_counts: dict[str, int] = {}


def _generate_partner_ref() -> str:
    """Generate a mock partner reference ID."""
    suffix = "".join(random.choices(string.digits, k=6))
    return f"PAYU_REF_{suffix}"


async def _send_callback(callback_url: str, payload: dict, delay: float):
    """Send a callback to GrabCredit's webhook endpoint after a delay."""
    await asyncio.sleep(delay)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(callback_url, json=payload)
            logger.info(
                f"Callback sent: key={payload['idempotency_key']}, "
                f"status={payload['status']}, response={response.status_code}"
            )
    except Exception as e:
        logger.error(f"Callback delivery failed: {e}")


async def handle_partner_request(request: dict) -> dict:
    """Process a mock partner checkout request.

    Based on partner_behavior, schedules appropriate callbacks.
    Returns a response dict with status code and body.
    """
    behavior = request.get("partner_behavior", "success")
    idempotency_key = request["idempotency_key"]
    callback_url = request["callback_url"]
    partner_ref = _generate_partner_ref()

    # Track request count for transient failure
    _request_counts[idempotency_key] = _request_counts.get(idempotency_key, 0) + 1
    attempt = _request_counts[idempotency_key]

    base_callback = {
        "idempotency_key": idempotency_key,
        "partner_ref": partner_ref,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if behavior == "success":
        # Send success callback after 2-3 second delay
        delay = random.uniform(2.0, 3.0)
        callback = {**base_callback, "status": "success", "decline_reason": None, "error_code": None}
        asyncio.create_task(_send_callback(callback_url, callback, delay))
        return {"status_code": 200, "body": {"accepted": True, "partner_ref": partner_ref}}

    elif behavior == "decline":
        # Send decline callback after 1-2 second delay
        delay = random.uniform(1.0, 2.0)
        callback = {
            **base_callback,
            "status": "declined",
            "decline_reason": "Insufficient credit score",
            "error_code": "PARTNER_CREDIT_CHECK_FAILED",
        }
        asyncio.create_task(_send_callback(callback_url, callback, delay))
        return {"status_code": 200, "body": {"accepted": True, "partner_ref": partner_ref}}

    elif behavior == "transient_failure":
        # Return 500 on first 1-2 attempts, then succeed
        if attempt <= 2:
            logger.info(
                f"Transient failure: key={idempotency_key}, attempt={attempt}"
            )
            return {"status_code": 500, "body": {"error": "Internal Server Error"}}
        else:
            # Third attempt succeeds
            delay = random.uniform(2.0, 3.0)
            callback = {**base_callback, "status": "success", "decline_reason": None, "error_code": None}
            asyncio.create_task(_send_callback(callback_url, callback, delay))
            return {"status_code": 200, "body": {"accepted": True, "partner_ref": partner_ref}}

    elif behavior == "timeout":
        # Never send a callback — tests timeout flow
        logger.info(f"Timeout simulation: key={idempotency_key}, no callback will be sent")
        return {"status_code": 200, "body": {"accepted": True, "partner_ref": partner_ref}}

    elif behavior == "duplicate":
        # Send the same success callback twice
        delay1 = random.uniform(2.0, 3.0)
        delay2 = delay1 + random.uniform(0.5, 1.5)
        callback = {**base_callback, "status": "success", "decline_reason": None, "error_code": None}
        asyncio.create_task(_send_callback(callback_url, callback, delay1))
        asyncio.create_task(_send_callback(callback_url, callback, delay2))
        logger.info(f"Duplicate simulation: key={idempotency_key}, two callbacks scheduled")
        return {"status_code": 200, "body": {"accepted": True, "partner_ref": partner_ref}}

    else:
        return {"status_code": 400, "body": {"error": f"Unknown behavior: {behavior}"}}
