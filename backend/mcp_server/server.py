"""GrabCredit MCP Server.

Exposes two tools for AI-assisted BNPL workflows:
- check_bnpl_eligibility: Check BNPL eligibility for a user/merchant/cart
- initiate_bnpl_checkout: Initiate a BNPL checkout after approval

Runs on SSE transport at port 8001 so it can operate alongside the FastAPI backend.
"""

import sys
import os

# Add backend dir to path so imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mcp.server.fastmcp import FastMCP

import httpx

from eligibility.engine import run_eligibility_check
from models import PartnerBehavior
from config import get_settings

mcp = FastMCP(
    "GrabCredit",
    description="BNPL Eligibility & Checkout tools for GrabOn's deal platform",
    host="0.0.0.0",
    port=8001,
)


@mcp.tool()
def check_bnpl_eligibility(
    user_id: str,
    merchant_id: str,
    cart_value: float,
    deal_id: str | None = None,
) -> dict:
    """Check BNPL eligibility for a checkout scenario.

    Evaluates 5 rules (KYC, credit tier, cart limit, merchant eligibility, velocity)
    and returns a structured decision with reason codes, risk signals, EMI terms,
    and recovery options.

    Args:
        user_id: UUID of the user
        merchant_id: UUID of the merchant
        cart_value: Cart value in INR (must be positive)
        deal_id: Optional UUID of a specific deal

    Returns:
        Decision object with decision_id, decision (APPROVED/DECLINED), reason_codes,
        risk_signals, emi_terms, recovery_options, and expiry.

    Pre-seeded test users:
        - Priya Sharma (a1000000-0000-0000-0000-000000000001): KYC complete, GOLD, 20K limit (happy path)
        - Rahul Verma (a1000000-0000-0000-0000-000000000002): KYC complete, SILVER, 10K limit (cart limit)
        - Anita Desai (a1000000-0000-0000-0000-000000000003): KYC incomplete, GOLD, 15K limit
        - Vikram Singh (a1000000-0000-0000-0000-000000000004): KYC complete, BRONZE, 5K limit
        - Meera Patel (a1000000-0000-0000-0000-000000000005): KYC complete, PLATINUM, 50K limit

    Pre-seeded merchants:
        - Flipkart Electronics (b2000000-0000-0000-0000-000000000001): BNPL enabled
        - Amazon Fashion (b2000000-0000-0000-0000-000000000002): BNPL enabled
        - Local Store (b2000000-0000-0000-0000-000000000003): BNPL NOT enabled
        - Myntra (b2000000-0000-0000-0000-000000000004): BNPL enabled
    """
    try:
        result = run_eligibility_check(
            user_id=user_id,
            merchant_id=merchant_id,
            cart_value=cart_value,
            deal_id=deal_id,
        )
        return result.model_dump(mode="json")
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": f"Eligibility check failed: {str(e)}"}


@mcp.tool()
def initiate_bnpl_checkout(
    decision_id: str,
    emi_tenure_months: int = 3,
    partner_behavior: str = "success",
    is_partial_bnpl: bool = False,
    amount: float | None = None,
) -> dict:
    """Initiate a BNPL checkout after an approved eligibility decision.

    Creates a checkout attempt and dispatches to the mock payment partner.
    The partner will send callbacks asynchronously to the webhook endpoint.

    The checkout follows a state machine: INITIATED -> PENDING -> SUCCESS/DECLINED/FAILED/TIMED_OUT.

    IMPORTANT: The backend API server (port 8000) must be running for partner callbacks to work,
    since the mock partner sends callbacks to the webhook endpoint on localhost:8000.

    Args:
        decision_id: UUID from a previous check_bnpl_eligibility call (must not be expired, 15 min window)
        emi_tenure_months: EMI tenure - must be 3, 6, 9, or 12
        partner_behavior: Mock partner behavior:
            - "success": partner approves, sends success callback after 2-3s
            - "decline": partner declines, sends decline callback after 1-2s
            - "transient_failure": partner returns 500 on first attempts, then succeeds
            - "timeout": partner never sends callback (tests 5-min timeout)
            - "duplicate": partner sends same success callback twice
        is_partial_bnpl: True if accepting a partial BNPL recovery option
        amount: Override amount (required for partial BNPL, otherwise uses decision cart_value)

    Returns:
        Checkout object with checkout_id, idempotency_key, status, and amount.
        The checkout will progress through state transitions as partner callbacks arrive.
    """
    try:
        behavior = PartnerBehavior(partner_behavior)
    except ValueError:
        return {
            "error": f"Invalid partner_behavior: {partner_behavior}. "
            "Must be one of: success, decline, transient_failure, timeout, duplicate"
        }

    if emi_tenure_months not in [3, 6, 9, 12]:
        return {"error": f"Invalid emi_tenure_months: {emi_tenure_months}. Must be 3, 6, 9, or 12"}

    settings = get_settings()
    backend_url = settings.BACKEND_URL

    payload = {
        "decision_id": decision_id,
        "emi_tenure_months": emi_tenure_months,
        "partner_behavior": partner_behavior,
        "is_partial_bnpl": is_partial_bnpl,
    }
    if amount is not None:
        payload["amount"] = amount

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                f"{backend_url}/api/checkout/initiate",
                json=payload,
            )

        data = resp.json()

        if resp.status_code >= 400:
            return {"error": data.get("detail", {}).get("error", data.get("error", str(data)))}

        checkout_id = data["checkout_id"]
        return {
            "checkout_id": checkout_id,
            "decision_id": data["decision_id"],
            "idempotency_key": data["idempotency_key"],
            "status": data["status"],
            "amount": data["amount"],
            "is_partial_bnpl": data.get("is_partial_bnpl", False),
            "created_at": data["created_at"],
            "message": (
                f"Checkout initiated with partner_behavior='{partner_behavior}'. "
                "The mock partner will send callbacks to the backend. "
                f"Poll status: GET {backend_url}/api/checkout/{checkout_id}/status"
            ),
        }
    except httpx.ConnectError:
        return {
            "error": f"Cannot reach backend at {backend_url}. "
            "Make sure the FastAPI backend is running (uvicorn main:app --port 8000)."
        }
    except Exception as e:
        return {"error": f"Checkout initiation failed: {str(e)}"}



if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--transport", choices=["stdio", "sse"], default="stdio",
                        help="Transport: stdio (for Claude Desktop) or sse (for standalone)")
    args = parser.parse_args()
    mcp.run(transport=args.transport)
