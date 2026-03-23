"""Simulator API endpoints for the test harness.

GET /api/simulator/users — List test users
GET /api/simulator/merchants — List test merchants
GET /api/simulator/deals — List deals (optionally by merchant)
POST /api/simulator/toggle-kyc/{user_id} — Toggle KYC status
POST /api/simulator/reset-velocity/{user_id} — Clear velocity events
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from config import get_supabase
from models import ToggleKYCResponse

logger = logging.getLogger("grabcredit.api.simulator")
router = APIRouter()


@router.get("/users")
async def list_users():
    """List all test users."""
    db = get_supabase()
    result = db.table("users").select("*").order("name").execute()
    return result.data or []


@router.get("/merchants")
async def list_merchants():
    """List all test merchants."""
    db = get_supabase()
    result = db.table("merchants").select("*").order("name").execute()
    return result.data or []


@router.get("/deals")
async def list_deals(merchant_id: Optional[str] = Query(None)):
    """List all deals, optionally filtered by merchant_id."""
    db = get_supabase()
    query = db.table("deals").select("*, merchants(name, category, bnpl_enabled)")

    if merchant_id:
        query = query.eq("merchant_id", merchant_id)

    result = query.order("created_at", desc=True).execute()
    return result.data or []


@router.post("/toggle-kyc/{user_id}", response_model=ToggleKYCResponse)
async def toggle_kyc(user_id: str):
    """Toggle a user's KYC status (completed <-> incomplete).

    Used for simulating KYC completion recovery flow.
    """
    db = get_supabase()

    # Get current status
    user_result = db.table("users").select("kyc_status").eq("id", user_id).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail={"error": "User not found"})

    current_status = user_result.data[0]["kyc_status"]
    new_status = "completed" if current_status == "incomplete" else "incomplete"

    # Update
    db.table("users").update({"kyc_status": new_status}).eq("id", user_id).execute()

    logger.info(f"KYC toggled: user={user_id}, {current_status} -> {new_status}")

    return ToggleKYCResponse(
        user_id=user_id,
        kyc_status=new_status,
        previous_status=current_status,
    )


@router.post("/reset-velocity/{user_id}")
async def reset_velocity(user_id: str):
    """Clear velocity events for a user (for retesting)."""
    db = get_supabase()

    # Verify user exists
    user_result = db.table("users").select("id").eq("id", user_id).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail={"error": "User not found"})

    # Delete velocity events
    db.table("velocity_events").delete().eq("user_id", user_id).execute()

    logger.info(f"Velocity reset: user={user_id}")

    return {"user_id": user_id, "velocity_events_cleared": True}
