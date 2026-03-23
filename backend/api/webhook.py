"""Webhook API endpoints.

POST /api/webhook/partner-callback — Receive partner callbacks
POST /api/webhook/mock-partner-request — Internal endpoint for mock partner dispatch
"""

import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from models import PartnerCallbackRequest, PartnerCallbackResponse
from webhooks.callback_handler import process_callback
from partner.mock_partner import handle_partner_request

logger = logging.getLogger("grabcredit.api.webhook")
router = APIRouter()


@router.post(
    "/partner-callback",
    response_model=PartnerCallbackResponse,
)
async def partner_callback(request: Request):
    """Receive callbacks from the payment partner (or mock partner).

    Validates payload, checks idempotency, transitions checkout state,
    and logs everything to callback_logs.
    """
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(
            status_code=400,
            detail={"error": "Invalid JSON payload", "code": "INVALID_PAYLOAD", "details": None},
        )

    # Validate required fields
    required = ["idempotency_key", "partner_ref", "status", "timestamp"]
    missing = [f for f in required if f not in payload]
    if missing:
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"Missing required fields: {', '.join(missing)}",
                "code": "INVALID_PAYLOAD",
                "details": {"missing_fields": missing},
            },
        )

    try:
        result = process_callback(payload)
        return PartnerCallbackResponse(**result)
    except ValueError as e:
        error_msg = str(e)
        if "Unknown idempotency key" in error_msg:
            return JSONResponse(
                status_code=400,
                content={"error": "Unknown idempotency key", "received": False},
            )
        raise HTTPException(
            status_code=400,
            detail={"error": error_msg, "code": "INVALID_PAYLOAD", "details": None},
        )
    except Exception as e:
        logger.error(f"Callback processing error: {e}")
        raise HTTPException(status_code=500, detail={"error": "Internal server error"})


@router.post("/mock-partner-request")
async def mock_partner_endpoint(request: Request):
    """Internal endpoint that simulates the partner receiving a checkout request.

    The mock partner processes the request and schedules callbacks
    based on the configured behavior.
    """
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail={"error": "Invalid JSON"})

    result = await handle_partner_request(payload)
    return JSONResponse(status_code=result["status_code"], content=result["body"])
