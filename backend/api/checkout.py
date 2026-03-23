"""Checkout API endpoints.

POST /api/checkout/initiate — Initiate a BNPL checkout
GET /api/checkout/{checkout_id}/status — Poll checkout status
"""

import asyncio
import logging

from fastapi import APIRouter, HTTPException

from models import (
    CheckoutInitiateRequest,
    CheckoutInitiateResponse,
    CheckoutStatusResponse,
    ErrorResponse,
)
from checkout.orchestrator import create_checkout, dispatch_to_partner
from config import get_supabase, get_settings

logger = logging.getLogger("grabcredit.api.checkout")
router = APIRouter()


@router.post(
    "/initiate",
    response_model=CheckoutInitiateResponse,
    responses={400: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
async def initiate_checkout(request: CheckoutInitiateRequest):
    """Initiate a BNPL checkout after approval."""
    settings = get_settings()

    # Validate EMI tenure
    if request.emi_tenure_months not in settings.EMI_TENURE_OPTIONS:
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"Invalid EMI tenure. Must be one of {settings.EMI_TENURE_OPTIONS}",
                "code": "INVALID_PAYLOAD",
                "details": None,
            },
        )

    try:
        checkout = create_checkout(
            decision_id=str(request.decision_id),
            amount=request.amount,
            emi_tenure_months=request.emi_tenure_months,
            partner_behavior=request.partner_behavior,
            is_partial_bnpl=request.is_partial_bnpl,
        )
    except ValueError as e:
        error_msg = str(e)
        code_map = {
            "DECISION_NOT_FOUND": (404, "Decision not found"),
            "DECISION_EXPIRED": (400, "Decision has expired (> 15 minutes old)"),
            "DECISION_NOT_APPROVED": (400, "Decision is not APPROVED"),
            "CHECKOUT_ALREADY_EXISTS": (409, "Checkout already initiated for this decision"),
        }
        status, msg = code_map.get(error_msg, (400, error_msg))
        raise HTTPException(
            status_code=status,
            detail={"error": msg, "code": error_msg, "details": None},
        )
    except Exception as e:
        logger.error(f"Checkout initiation error: {e}")
        raise HTTPException(status_code=500, detail={"error": "Internal server error"})

    # Dispatch to partner asynchronously
    asyncio.create_task(dispatch_to_partner(checkout))

    return CheckoutInitiateResponse(
        checkout_id=checkout["id"],
        decision_id=checkout["decision_id"],
        idempotency_key=checkout["idempotency_key"],
        status=checkout["status"],
        amount=float(checkout["amount"]),
        is_partial_bnpl=checkout["is_partial_bnpl"],
        created_at=checkout["created_at"],
    )


@router.get(
    "/{checkout_id}/status",
    response_model=CheckoutStatusResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_checkout_status(checkout_id: str):
    """Poll for checkout status updates."""
    db = get_supabase()

    result = (
        db.table("checkout_attempts").select("*").eq("id", checkout_id).execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail={"error": "Checkout not found", "code": "CHECKOUT_NOT_FOUND", "details": None},
        )

    checkout = result.data[0]

    return CheckoutStatusResponse(
        checkout_id=checkout["id"],
        status=checkout["status"],
        partner_ref=checkout.get("partner_ref"),
        error_detail=checkout.get("error_detail"),
        retry_count=checkout.get("retry_count", 0),
        created_at=checkout["created_at"],
        updated_at=checkout["updated_at"],
    )
