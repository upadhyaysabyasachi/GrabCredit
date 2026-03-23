"""Dashboard API endpoints for the operator dashboard.

GET /api/dashboard/decisions — List decisions with filters
GET /api/dashboard/decisions/{decision_id} — Decision detail with checkout history
GET /api/dashboard/checkouts — List checkout attempts
GET /api/dashboard/checkouts/health — Health summary
GET /api/dashboard/callbacks — List callback logs
GET /api/dashboard/callbacks/stats — Callback stats
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from config import get_supabase
from models import (
    CheckoutHealthResponse,
    CallbackStatsResponse,
)

logger = logging.getLogger("grabcredit.api.dashboard")
router = APIRouter()


def _rename_id(row: dict, new_key: str) -> dict:
    """Rename 'id' to a domain-specific key (e.g. decision_id, checkout_id)."""
    if "id" in row:
        row = {**row, new_key: row["id"]}
        del row["id"]
    return row


@router.get("/decisions")
async def list_decisions(
    user_id: Optional[str] = Query(None),
    decision: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List all eligibility decisions with optional filters."""
    db = get_supabase()
    query = db.table("eligibility_decisions").select("*", count="exact")

    if user_id:
        query = query.eq("user_id", user_id)
    if decision:
        query = query.eq("decision", decision)

    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
    result = query.execute()

    decisions = [_rename_id(d, "decision_id") for d in (result.data or [])]
    return {
        "decisions": decisions,
        "total": result.count or 0,
        "limit": limit,
        "offset": offset,
    }


@router.get("/decisions/{decision_id}")
async def get_decision_detail(decision_id: str):
    """Get full decision detail with linked checkout and callback history."""
    db = get_supabase()

    # Get decision
    decision_result = (
        db.table("eligibility_decisions").select("*").eq("id", decision_id).execute()
    )
    if not decision_result.data:
        raise HTTPException(status_code=404, detail={"error": "Decision not found"})

    decision = decision_result.data[0]

    # Get linked checkouts
    checkouts = (
        db.table("checkout_attempts")
        .select("*")
        .eq("decision_id", decision_id)
        .order("created_at", desc=True)
        .execute()
    )

    # Get callbacks for those checkouts
    callbacks = []
    for checkout in checkouts.data or []:
        cb_result = (
            db.table("callback_logs")
            .select("*")
            .eq("checkout_id", checkout["id"])
            .order("created_at", desc=True)
            .execute()
        )
        callbacks.extend(cb_result.data or [])

    # Get user and merchant info
    user = db.table("users").select("name, email").eq("id", decision["user_id"]).execute()
    merchant = db.table("merchants").select("name, category").eq("id", decision["merchant_id"]).execute()

    return {
        "decision": _rename_id(decision, "decision_id"),
        "user": user.data[0] if user.data else None,
        "merchant": merchant.data[0] if merchant.data else None,
        "checkouts": [_rename_id(c, "checkout_id") for c in (checkouts.data or [])],
        "callbacks": callbacks,
    }


@router.get("/checkouts")
async def list_checkouts(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List all checkout attempts with optional status filter."""
    db = get_supabase()
    query = db.table("checkout_attempts").select("*", count="exact")

    if status:
        query = query.eq("status", status)

    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
    result = query.execute()

    checkouts = [_rename_id(c, "checkout_id") for c in (result.data or [])]
    return {
        "checkouts": checkouts,
        "total": result.count or 0,
        "limit": limit,
        "offset": offset,
    }


@router.get("/checkouts/health", response_model=CheckoutHealthResponse)
async def checkout_health():
    """Get checkout health summary for the last 1 hour."""
    db = get_supabase()
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

    result = (
        db.table("checkout_attempts")
        .select("status")
        .gte("created_at", one_hour_ago)
        .execute()
    )

    # Count by status
    by_status: dict[str, int] = {}
    for row in result.data or []:
        s = row["status"]
        by_status[s] = by_status.get(s, 0) + 1

    total = sum(by_status.values())
    failed = by_status.get("FAILED", 0) + by_status.get("TIMED_OUT", 0)
    failure_rate = round(failed / total, 4) if total > 0 else 0.0

    # Health status thresholds
    if failure_rate < 0.05:
        health = "green"
    elif failure_rate < 0.10:
        health = "yellow"
    else:
        health = "red"

    return CheckoutHealthResponse(
        total=total,
        by_status=by_status,
        failure_rate=failure_rate,
        health=health,
        window_minutes=60,
    )


@router.get("/callbacks")
async def list_callbacks(
    is_duplicate: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List callback logs with optional duplicate filter."""
    db = get_supabase()
    query = db.table("callback_logs").select("*", count="exact")

    if is_duplicate is not None:
        query = query.eq("is_duplicate", is_duplicate)

    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
    result = query.execute()

    return {
        "callbacks": result.data or [],
        "total": result.count or 0,
        "limit": limit,
        "offset": offset,
    }


@router.get("/callbacks/stats", response_model=CallbackStatsResponse)
async def callback_stats():
    """Get callback health stats — total, duplicate count, duplicate rate."""
    db = get_supabase()

    total_result = (
        db.table("callback_logs").select("id", count="exact").execute()
    )
    total = total_result.count or 0

    dup_result = (
        db.table("callback_logs")
        .select("id", count="exact")
        .eq("is_duplicate", True)
        .execute()
    )
    duplicate_count = dup_result.count or 0

    duplicate_rate = round(duplicate_count / total, 4) if total > 0 else 0.0

    return CallbackStatsResponse(
        total=total,
        duplicate_count=duplicate_count,
        duplicate_rate=duplicate_rate,
    )
