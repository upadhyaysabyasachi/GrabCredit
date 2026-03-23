"""Pydantic models for GrabCredit API."""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# --- Enums ---

class Decision(str, Enum):
    APPROVED = "APPROVED"
    DECLINED = "DECLINED"


class CheckoutStatus(str, Enum):
    INITIATED = "INITIATED"
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    DECLINED = "DECLINED"
    FAILED = "FAILED"
    TIMED_OUT = "TIMED_OUT"


class PartnerBehavior(str, Enum):
    SUCCESS = "success"
    DECLINE = "decline"
    TRANSIENT_FAILURE = "transient_failure"
    TIMEOUT = "timeout"
    DUPLICATE = "duplicate"


class ReasonCode(str, Enum):
    KYC_INCOMPLETE = "KYC_INCOMPLETE"
    CREDIT_TIER_INSUFFICIENT = "CREDIT_TIER_INSUFFICIENT"
    CART_VALUE_EXCEEDS_LIMIT = "CART_VALUE_EXCEEDS_LIMIT"
    MERCHANT_NOT_ELIGIBLE = "MERCHANT_NOT_ELIGIBLE"
    VELOCITY_LIMIT_EXCEEDED = "VELOCITY_LIMIT_EXCEEDED"


class RecoveryType(str, Enum):
    PARTIAL_BNPL = "PARTIAL_BNPL"
    INLINE_KYC = "INLINE_KYC"
    UPGRADE_PATH = "UPGRADE_PATH"
    ALT_DEALS = "ALT_DEALS"


class CallbackStatus(str, Enum):
    SUCCESS = "success"
    DECLINED = "declined"
    ERROR = "error"


# --- Risk Signals ---

class RuleResult(BaseModel):
    rule: str
    input: object
    result: str  # "PASS" or "FAIL"


# --- EMI ---

class EMIOption(BaseModel):
    tenure_months: int
    monthly_emi: float
    interest_rate: float
    total_amount: float


class EMITerms(BaseModel):
    options: list[EMIOption]


# --- Recovery Options ---

class RecoveryOption(BaseModel):
    type: RecoveryType
    upfront_amount: Optional[float] = None
    bnpl_amount: Optional[float] = None
    emi_terms: Optional[EMITerms] = None
    message: str
    cta_label: str
    cta_action: str


# --- Eligibility ---

class EligibilityCheckRequest(BaseModel):
    user_id: UUID
    merchant_id: UUID
    cart_value: float = Field(gt=0, description="Cart value in INR, must be positive")
    deal_id: Optional[UUID] = None


class EligibilityCheckResponse(BaseModel):
    decision_id: UUID
    user_id: UUID
    merchant_id: UUID
    cart_value: float
    decision: Decision
    reason_codes: list[str]
    risk_signals: dict[str, RuleResult]
    emi_terms: Optional[EMITerms] = None
    recovery_options: Optional[list[RecoveryOption]] = None
    expires_at: datetime
    created_at: datetime


# --- Checkout ---

class CheckoutInitiateRequest(BaseModel):
    decision_id: UUID
    emi_tenure_months: int = Field(description="Must be 3, 6, 9, or 12")
    partner_behavior: PartnerBehavior = PartnerBehavior.SUCCESS
    is_partial_bnpl: bool = False
    amount: Optional[float] = None


class CheckoutInitiateResponse(BaseModel):
    checkout_id: UUID
    decision_id: UUID
    idempotency_key: str
    status: CheckoutStatus
    amount: float
    is_partial_bnpl: bool = False
    created_at: datetime


class CheckoutStatusResponse(BaseModel):
    checkout_id: UUID
    status: CheckoutStatus
    partner_ref: Optional[str] = None
    error_detail: Optional[str] = None
    retry_count: int
    created_at: datetime
    updated_at: datetime


# --- Webhook / Callback ---

class PartnerCallbackRequest(BaseModel):
    idempotency_key: str
    partner_ref: str
    status: CallbackStatus
    decline_reason: Optional[str] = None
    error_code: Optional[str] = None
    timestamp: datetime


class PartnerCallbackResponse(BaseModel):
    received: bool
    is_duplicate: bool = False


# --- Dashboard ---

class DashboardDecisionsResponse(BaseModel):
    decisions: list[dict]
    total: int
    limit: int
    offset: int


class CheckoutHealthResponse(BaseModel):
    total: int
    by_status: dict[str, int]
    failure_rate: float
    health: str  # green, yellow, red
    window_minutes: int


class CallbackStatsResponse(BaseModel):
    total: int
    duplicate_count: int
    duplicate_rate: float


# --- Simulator ---

class ToggleKYCResponse(BaseModel):
    user_id: UUID
    kyc_status: str
    previous_status: str


# --- Error ---

class ErrorResponse(BaseModel):
    error: str
    code: str
    details: Optional[dict] = None
