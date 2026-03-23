"""POST /api/eligibility/check — BNPL eligibility check endpoint."""

import logging

from fastapi import APIRouter, HTTPException

from models import EligibilityCheckRequest, EligibilityCheckResponse, ErrorResponse
from eligibility.engine import run_eligibility_check

logger = logging.getLogger("grabcredit.api.eligibility")
router = APIRouter()


@router.post(
    "/check",
    response_model=EligibilityCheckResponse,
    responses={400: {"model": ErrorResponse}},
)
async def check_eligibility(request: EligibilityCheckRequest):
    """Check BNPL eligibility for a checkout scenario.

    Evaluates all 5 rules, generates reason codes, risk signals,
    EMI terms (if approved), and recovery options (if declined).
    """
    try:
        result = run_eligibility_check(
            user_id=str(request.user_id),
            merchant_id=str(request.merchant_id),
            cart_value=request.cart_value,
            deal_id=str(request.deal_id) if request.deal_id else None,
        )
        return result
    except ValueError as e:
        error_msg = str(e)
        if "User not found" in error_msg:
            raise HTTPException(
                status_code=400,
                detail={"error": error_msg, "code": "USER_NOT_FOUND", "details": None},
            )
        elif "Merchant not found" in error_msg:
            raise HTTPException(
                status_code=400,
                detail={"error": error_msg, "code": "MERCHANT_NOT_FOUND", "details": None},
            )
        else:
            raise HTTPException(
                status_code=400,
                detail={"error": error_msg, "code": "INVALID_PAYLOAD", "details": None},
            )
    except Exception as e:
        logger.error(f"Eligibility check error: {e}")
        raise HTTPException(status_code=500, detail={"error": "Internal server error"})
